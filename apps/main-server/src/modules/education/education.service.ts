import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import * as fs from 'fs';
import * as path from 'path';
import { UsersService } from '../users/users.service';
import { COURSES, CourseData, CourseLecture } from './education.data';
import { generateR2PresignedUrl } from './r2-presigner.util';

/**
 * Exact probed durations for all known video classes in Cloudflare R2
 */
const KNOWN_CLASS_DURATIONS: Record<number, number> = {
  1: 122, 2: 79, 3: 139, 4: 125, 5: 128, 6: 138, 7: 165, 8: 135, 9: 110, 10: 117,
  11: 153, 12: 122, 13: 120, 14: 139, 15: 133, 16: 130, 17: 135, 18: 131, 19: 135, 20: 140,
  21: 102, 22: 143, 23: 133, 24: 136, 25: 133, 26: 130, 27: 126, 28: 128, 29: 123, 30: 120,
  31: 135, 32: 109, 33: 71, 34: 129, 35: 124, 36: 128, 37: 133, 38: 124, 39: 120, 40: 128,
  41: 128, 42: 120, 43: 127, 44: 125, 45: 126, 46: 123, 47: 127, 48: 120, 49: 143, 50: 126,
  51: 131, 52: 122, 53: 127, 54: 128, 55: 133, 56: 138, 57: 126, 58: 136, 59: 133, 60: 130,
  61: 132, 62: 121,
};

@Injectable()
export class EducationService implements OnModuleInit {
  private readonly logger = new Logger(EducationService.name);
  private dynamicCoursesCache = new Map<string, CourseData>();
  private lastSyncTime = new Map<string, number>();
  private readonly CACHE_TTL_MS = 15 * 60 * 1000; // 15-minute TTL for background re-sync

  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
  ) {}

  async onModuleInit() {
    try {
      await this.syncLectures('tcbt-organic-farming-101');
    } catch (err: any) {
      this.logger.warn(`Initial R2 lecture sync deferred: ${err.message}`);
    }
  }

  /**
   * 1. Get Course details and public lecture metadata list (with dynamic sync support)
   */
  async getCourseLectures(courseId: string) {
    const lastSync = this.lastSyncTime.get(courseId) || 0;
    const isExpired = Date.now() - lastSync > this.CACHE_TTL_MS;
    let course = this.dynamicCoursesCache.get(courseId);

    if (!course || isExpired) {
      course = await this.syncLectures(courseId).catch(() => {
        return course || COURSES.find((c) => c.id === courseId);
      });
    }

    if (!course) {
      throw new NotFoundException(`Course '${courseId}' not found`);
    }

    const totalDuration = course.lectures.reduce(
      (sum, l) => sum + (l.duration || 0),
      0,
    );

    return {
      courseId: course.id,
      title: course.title,
      folderId: course.folderId,
      totalLectures: course.lectures.length,
      totalDuration,
      instructor: course.instructor || 'प्रोफेसर ताराचंद बेलजी',
      instructorTitle: course.instructorTitle || 'TCBT कृषि संस्थापक एवं प्रणेता',
      lectures: course.lectures.map((l) => ({
        id: l.id,
        title: l.title,
        description: l.description,
        duration: l.duration,
        order: l.order,
        isFree: l.isFree,
      })),
    };
  }

  /**
   * 2. Dynamically sync lectures from Cloudflare R2 bucket & local processed-videos.json
   */
  async syncLectures(courseId: string): Promise<CourseData> {
    const baseCourse = COURSES.find((c) => c.id === courseId) || COURSES[0];
    if (!baseCourse) {
      throw new NotFoundException(`Course '${courseId}' not found`);
    }

    const lectureMap = new Map<number, CourseLecture>();

    // Step A: Seed with existing base lectures
    for (const l of baseCourse.lectures) {
      lectureMap.set(l.order, { ...l });
    }

    // Step B: Check processed-videos.json from video upload pipeline
    const processedPath =
      this.configService.get<string>('PROCESSED_VIDEOS_PATH') ||
      path.resolve(
        process.cwd(),
        '../video_upload_cloudflare/processed-videos.json',
      );

    if (fs.existsSync(processedPath)) {
      try {
        const raw = fs.readFileSync(processedPath, 'utf8');
        const data = JSON.parse(raw);
        const videos = Object.values(data.videos || {}) as any[];

        for (const v of videos) {
          const match = v.fileName?.match(/CLASS\s*(\d+)/i);
          if (match) {
            const classNum = parseInt(match[1], 10);
            const dateMatch = v.fileName?.match(/(\d{2}-\d{2}-\d{4})/);
            const dateStr = dateMatch
              ? dateMatch[1]
              : v.processedAt
                ? new Date(v.processedAt).toLocaleDateString('en-GB')
                : '';

            const id = `class-${classNum.toString().padStart(2, '0')}`;
            const title = `कक्षा ${classNum.toString().padStart(2, '0')}: TCBT वृक्षायुर्वेद विज्ञान${dateStr ? ` (${dateStr})` : ''}`;
            const r2Key = v.r2Key || `videos/CLASS ${classNum}.mp4`;
            const duration = KNOWN_CLASS_DURATIONS[classNum] || 120;

            const existing = lectureMap.get(classNum);
            lectureMap.set(classNum, {
              id: existing?.id || id,
              title: existing?.title || title,
              description:
                existing?.description ||
                `TCBT वृक्षायुर्वेद विज्ञान CLASS ${classNum} - प्राकृतिक कृषि एवं वृक्षायुर्वेद विज्ञान।`,
              duration: existing?.duration || duration,
              order: classNum,
              isFree: classNum === 1,
              r2Key,
            });
          }
        }
        this.logger.log(
          `Processed-videos sync: mapped ${videos.length} videos from ${processedPath}`,
        );
      } catch (err: any) {
        this.logger.warn(
          `Failed to read processed-videos.json: ${err.message}`,
        );
      }
    }

    // Step C: Query Cloudflare R2 bucket directly via S3 API
    const accountId =
      this.configService.get<string>('CLOUDFLARE_R2_ACCOUNT_ID') ||
      '02a1b14968e7da33ad7b20e67ea9fb03';
    const bucketName =
      this.configService.get<string>('CLOUDFLARE_R2_BUCKET_NAME') ||
      'lectures-videos';
    const accessKeyId = this.configService.get<string>(
      'CLOUDFLARE_R2_ACCESS_KEY_ID',
    );
    const secretAccessKey = this.configService.get<string>(
      'CLOUDFLARE_R2_SECRET_ACCESS_KEY',
    );

    if (accessKeyId && secretAccessKey) {
      try {
        const s3 = new S3Client({
          region: 'auto',
          endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
          credentials: { accessKeyId, secretAccessKey },
        });

        let continuationToken: string | undefined = undefined;
        let isTruncated = true;
        let r2DiscoveredCount = 0;

        while (isTruncated) {
          const res = await s3.send(
            new ListObjectsV2Command({
              Bucket: bucketName,
              Prefix: 'videos/CLASS ',
              ContinuationToken: continuationToken,
            }),
          );

          if (res.Contents) {
            for (const item of res.Contents) {
              if (!item.Key) continue;
              const match = item.Key.match(/CLASS\s*(\d+)/i);
              if (match) {
                const classNum = parseInt(match[1], 10);
                if (!lectureMap.has(classNum)) {
                  r2DiscoveredCount++;
                  lectureMap.set(classNum, {
                    id: `class-${classNum.toString().padStart(2, '0')}`,
                    title: `कक्षा ${classNum.toString().padStart(2, '0')}: TCBT वृक्षायुर्वेद विज्ञान`,
                    description: `TCBT वृक्षायुर्वेद विज्ञान CLASS ${classNum} - प्राकृतिक कृषि एवं वृक्षायुर्वेद विज्ञान।`,
                    duration: KNOWN_CLASS_DURATIONS[classNum] || 120,
                    order: classNum,
                    isFree: classNum === 1,
                    r2Key: item.Key,
                  });
                }
              }
            }
          }
          isTruncated = res.IsTruncated || false;
          continuationToken = res.NextContinuationToken;
        }

        if (r2DiscoveredCount > 0) {
          this.logger.log(
            `Discovered ${r2DiscoveredCount} additional classes directly from Cloudflare R2 bucket`,
          );
        }
      } catch (err: any) {
        this.logger.warn(`Cloudflare R2 S3 scan warning: ${err.message}`);
      }
    }

    // Step D: Sort all lectures in ascending order
    const sortedLectures = Array.from(lectureMap.values()).sort(
      (a, b) => a.order - b.order,
    );

    const syncedCourse: CourseData = {
      ...baseCourse,
      lectures: sortedLectures,
    };

    this.dynamicCoursesCache.set(courseId, syncedCourse);
    this.lastSyncTime.set(courseId, Date.now());
    this.logger.log(
      `Course '${courseId}' synced successfully with ${sortedLectures.length} total lectures`,
    );

    return syncedCourse;
  }

  /**
   * 3. Fetch authenticated watch stream URL
   * - Free lectures (isFree = true) are available to anyone
   * - Paid lectures require logged-in user enrolled in the course
   */
  async getLectureWatchUrl(
    userId: string | null,
    lectureId: string,
    courseId?: string,
  ) {
    const cId = courseId || 'tcbt-organic-farming-101';
    let course = this.dynamicCoursesCache.get(cId);
    if (!course) {
      course = await this.syncLectures(cId).catch(() => COURSES[0]);
    }

    if (!course) {
      throw new NotFoundException('Course not found');
    }

    const lecture = course.lectures.find((l) => l.id === lectureId);
    if (!lecture) {
      throw new NotFoundException(`Lecture '${lectureId}' not found`);
    }

    // Access control: Free vs Paid
    if (!lecture.isFree) {
      if (!userId) {
        throw new ForbiddenException(
          'Please log in and purchase the course to watch this lecture.',
        );
      }

      // Check enrollment in database
      const enrollment = await this.usersService.getUserEnrolledCourses(userId);
      const isEnrolled = enrollment.enrolled_courses?.includes(course.id);

      if (!isEnrolled) {
        throw new ForbiddenException(
          'कृपया इस व्याख्यान को देखने के लिए पाठ्यक्रम खरीदें। (Please purchase the course to access this lecture)',
        );
      }
    }

    // Generate secure Cloudflare R2 Presigned URL
    const videoUrl = this.generateVideoUrl(lecture.r2Key);

    return {
      lectureId: lecture.id,
      title: lecture.title,
      duration: lecture.duration,
      isFree: lecture.isFree,
      videoUrl,
    };
  }

  /**
   * 4. Create course purchase order
   */
  async createCourseOrder(
    userId: string,
    courseId: string,
    amount: number,
    description: string,
  ) {
    const course =
      this.dynamicCoursesCache.get(courseId) ||
      COURSES.find((c) => c.id === courseId);
    if (!course) {
      throw new NotFoundException(`Course '${courseId}' not found`);
    }

    const orderId = `EDU_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    return {
      success: true,
      orderId,
      courseId,
      amount: amount || course.price,
      description: description || course.title,
      paymentSessionId: `session_${orderId}`,
    };
  }

  /**
   * Helper to generate a 2-hour expiring presigned Cloudflare R2 URL
   */
  private generateVideoUrl(r2Key: string): string {
    const accountId =
      this.configService.get<string>('CLOUDFLARE_R2_ACCOUNT_ID') ||
      '02a1b14968e7da33ad7b20e67ea9fb03';
    const bucketName =
      this.configService.get<string>('CLOUDFLARE_R2_BUCKET_NAME') ||
      'lectures-videos';
    const accessKeyId = this.configService.get<string>(
      'CLOUDFLARE_R2_ACCESS_KEY_ID',
    );
    const secretAccessKey = this.configService.get<string>(
      'CLOUDFLARE_R2_SECRET_ACCESS_KEY',
    );
    const publicDomain = this.configService.get<string>(
      'CLOUDFLARE_R2_PUBLIC_DOMAIN',
    );

    // If API credentials are configured in .env, generate signed S3/R2 URL
    if (accessKeyId && secretAccessKey) {
      try {
        return generateR2PresignedUrl({
          accountId,
          bucketName,
          key: r2Key,
          accessKeyId,
          secretAccessKey,
          expiresInSeconds: 7200, // 2 hours
        });
      } catch (err: any) {
        this.logger.error(`Error generating R2 presigned URL: ${err.message}`);
      }
    }

    // Fallback: If public domain is configured
    if (publicDomain) {
      const cleanDomain = publicDomain.replace(/\/$/, '');
      const encodedKey = r2Key.split('/').map(encodeURIComponent).join('/');
      return `${cleanDomain}/${encodedKey}`;
    }

    // Default R2.dev fallback
    const encodedKey = r2Key.split('/').map(encodeURIComponent).join('/');
    return `https://pub-b30bf5dcb5c54e619a24a0f7d1b2d91e.r2.dev/${encodedKey}`;
  }
}
