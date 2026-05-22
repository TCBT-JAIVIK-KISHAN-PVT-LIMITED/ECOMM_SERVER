import { Injectable, Logger } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as crypto from 'crypto';

const MAX_IMAGE_SIZE_MB = 10;
const MAX_IMAGE_SIZE_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024;

export interface S3UploadResult {
  s3Url: string;
  s3Key: string;
  imageHash: string;
  /** true when the image was unchanged — no upload performed */
  skipped: boolean;
}

/**
 * S3UploadService — raw S3 operations only.
 * No Zoho logic. No MongoDB. No product awareness.
 */
@Injectable()
export class S3UploadService {
  private readonly logger = new Logger(S3UploadService.name);
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly region: string;

  constructor(private readonly configService: ConfigService) {
    this.bucket = this.configService.getOrThrow<string>('AWS_S3_BUCKET_NAME');
    this.region = this.configService.getOrThrow<string>('AWS_REGION');

    this.s3 = new S3Client({
      region: this.region,
      credentials: {
        accessKeyId: this.configService.getOrThrow<string>('AWS_ACCESS_KEY_ID'),
        secretAccessKey: this.configService.getOrThrow<string>('AWS_SECRET_ACCESS_KEY'),
      },
    });
  }

  // ─────────────────────────────────────────
  // Upload image from a remote URL to S3.
  //
  // Pass `existingHash` to enable skip-if-unchanged optimisation.
  // ─────────────────────────────────────────
  async uploadImageFromUrl(
    imageUrl: string,
    itemId: string,
    zohoToken?: string,
    existingHash?: string,
  ): Promise<S3UploadResult> {
    this.logger.log(`⬇️  Downloading image for item ${itemId}`);

    const response = await axios.get<ArrayBuffer>(imageUrl, {
      responseType: 'arraybuffer',
      headers: zohoToken
        ? { Authorization: `Zoho-oauthtoken ${zohoToken}` }
        : {},
      maxContentLength: MAX_IMAGE_SIZE_BYTES,
      maxBodyLength: MAX_IMAGE_SIZE_BYTES,
      timeout: 30_000,
    });

    const buffer = Buffer.from(response.data);

    if (buffer.length > MAX_IMAGE_SIZE_BYTES) {
      throw new Error(
        `Image too large: ${(buffer.length / 1024 / 1024).toFixed(2)} MB` +
          ` (max ${MAX_IMAGE_SIZE_MB} MB)`,
      );
    }

    // ── Hash ────────────────────────────────────────────────────
    const imageHash = crypto.createHash('md5').update(buffer).digest('hex');
    const contentType = response.headers['content-type'] as string | undefined;
    const ext = this.safeExtension(contentType);
    const s3Key = `products/${itemId}.${ext}`;
    const s3Url = `https://${this.bucket}.s3.${this.region}.amazonaws.com/${s3Key}`;

    // ── Skip if unchanged ────────────────────────────────────────
    if (existingHash && existingHash === imageHash && (await this.fileExists(s3Key))) {
      this.logger.log(`⏭️  Image unchanged — skipping upload for ${itemId}`);
      return { s3Url, s3Key, imageHash, skipped: true };
    }

    // ── Upload ───────────────────────────────────────────────────
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: s3Key,
        Body: buffer,
        ContentType: contentType ?? 'image/jpeg',
      }),
    );

    this.logger.log(`✅ Uploaded ${s3Key}`);
    return { s3Url, s3Key, imageHash, skipped: false };
  }

  // ─────────────────────────────────────────
  // Delete an object from S3 by key.
  // ─────────────────────────────────────────
  async deleteImage(s3Key: string): Promise<void> {
    if (!s3Key) return;

    if (!(await this.fileExists(s3Key))) {
      this.logger.warn(`⚠️  S3 object not found — skipping delete: ${s3Key}`);
      return;
    }

    await this.s3.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: s3Key }),
    );
    this.logger.log(`🗑️  Deleted ${s3Key} from S3`);
  }

  // ─────────────────────────────────────────
  // PRIVATE
  // ─────────────────────────────────────────

  private async fileExists(key: string): Promise<boolean> {
    try {
      await this.s3.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }

  private safeExtension(contentType?: string): string {
    if (!contentType) return 'jpg';
    const raw = contentType.split('/')[1]?.split(';')[0]?.toLowerCase() ?? '';
    const allowed: Record<string, string> = {
      jpg: 'jpg',
      jpeg: 'jpg',
      png: 'png',
      webp: 'webp',
      gif: 'gif',
    };
    return allowed[raw] ?? 'jpg';
  }
}