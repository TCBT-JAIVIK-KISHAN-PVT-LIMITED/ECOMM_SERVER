import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { COURSES } from './education.data';
import { generateR2PresignedUrl } from './r2-presigner.util';

@Injectable()
export class EducationService {
  private readonly logger = new Logger(EducationService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
  ) {}

  /**
   * 1. Get Course details and public lecture metadata list
   */
  getCourseLectures(courseId: string) {
    const course = COURSES.find((c) => c.id === courseId);
    if (!course) {
      throw new NotFoundException(`Course '${courseId}' not found`);
    }

    return {
      courseId: course.id,
      folderId: course.folderId,
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
   * 2. Fetch authenticated watch stream URL
   * - Free lectures (isFree = true) are available to anyone
   * - Paid lectures require logged-in user enrolled in the course
   */
  async getLectureWatchUrl(
    userId: string | null,
    lectureId: string,
    courseId?: string,
  ) {
    const course = courseId
      ? COURSES.find((c) => c.id === courseId)
      : COURSES[0];

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
   * 3. Create course purchase order
   */
  async createCourseOrder(
    userId: string,
    courseId: string,
    amount: number,
    description: string,
  ) {
    const course = COURSES.find((c) => c.id === courseId);
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
