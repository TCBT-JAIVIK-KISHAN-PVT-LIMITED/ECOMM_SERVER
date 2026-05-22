import { Injectable, Logger } from '@nestjs/common';
import { S3UploadService } from '../../common/s3-upload.service';
import { ZohoInventoryService } from '../../zoho/inventory/inventory.service';

const MAX_RETRIES = 3;
const RETRY_BASE_MS = 2000;

interface ImageMeta {
  image_url: string;
  image_s3_key: string;
  image_hash: string;
  image_name: string;
  image_last_synced_at: Date;
}

/**
 * ZohoImageSyncService — single responsibility:
 *   Download a Zoho item image → upload to S3 → return metadata.
 *
 * It does NOT:
 *   - talk to MongoDB
 *   - fetch item details
 *   - build product documents
 *   - run crons
 */
@Injectable()
export class ZohoImageSyncService {
  private readonly logger = new Logger(ZohoImageSyncService.name);

  constructor(
    private readonly s3UploadService: S3UploadService,
    private readonly zohoInventoryService: ZohoInventoryService,
  ) {}

  // ─────────────────────────────────────────────────────────────
  // PUBLIC: sync image for one Zoho item
  //
  // Returns the new ImageMeta if the image was uploaded/updated,
  // returns the existing ImageMeta if nothing changed (hash match),
  // returns null if the item has no image in Zoho.
  // ─────────────────────────────────────────────────────────────
  async syncImageForItem(
    itemId: string,
    zohoImageName: string | undefined | null,
    existingImage: ImageMeta | null,
  ): Promise<ImageMeta | null> {

    // ── 1. No image in Zoho ──────────────────────────────────────
    if (!zohoImageName) {
      // If we previously had an image, delete it from S3
      if (existingImage?.image_s3_key) {
        await this.safeDeleteFromS3(existingImage.image_s3_key);
      }
      return null;
    }

    // ── 2. Fetch image URL + token from Zoho ─────────────────────
    const meta = await this.withRetry(
      () => this.zohoInventoryService.getItemImageMeta(itemId),
      `Fetch image meta for ${itemId}`,
    );

    if (!meta) {
      // Zoho returned 400/404 — treat as no image
      if (existingImage?.image_s3_key) {
        await this.safeDeleteFromS3(existingImage.image_s3_key);
      }
      return null;
    }

    // ── 3. Detect image name change (force re-upload if changed) ─
    const imageNameChanged = existingImage?.image_name !== zohoImageName;
    const existingHashToCheck = imageNameChanged ? undefined : existingImage?.image_hash;

    // ── 4. Upload to S3 (skips if hash matches) ──────────────────
    const uploadResult = await this.withRetry(
      () =>
        this.s3UploadService.uploadImageFromUrl(
          meta.imageUrl,
          itemId,
          meta.zohoToken,
          existingHashToCheck,
        ),
      `S3 upload for ${itemId}`,
    );

    // ── 5. If image actually changed, delete old S3 object ───────
    if (!uploadResult.skipped && imageNameChanged && existingImage?.image_s3_key) {
      await this.safeDeleteFromS3(existingImage.image_s3_key);
    }

    // ── 6. If unchanged, return existing meta as-is ───────────────
    if (uploadResult.skipped && existingImage) {
      return existingImage;
    }

    // ── 7. Return fresh metadata ──────────────────────────────────
    return {
      image_url: uploadResult.s3Url,
      image_s3_key: uploadResult.s3Key,
      image_hash: uploadResult.imageHash,
      image_name: zohoImageName,
      image_last_synced_at: new Date(),
    };
  }

  // ─────────────────────────────────────────────────────────────
  // PUBLIC: delete a file from S3 by key
  // Called by ProductSyncService when deleting a product.
  // ─────────────────────────────────────────────────────────────
  async deleteFromS3(s3Key: string): Promise<void> {
    return this.safeDeleteFromS3(s3Key);
  }

  // ─────────────────────────────────────────────────────────────
  // PRIVATE HELPERS
  // ─────────────────────────────────────────────────────────────

  private async safeDeleteFromS3(s3Key: string): Promise<void> {
    try {
      await this.s3UploadService.deleteImage(s3Key);
    } catch (err: any) {
      this.logger.warn(`⚠️ S3 delete failed for ${s3Key}: ${err.message}`);
    }
  }

  private async withRetry<T>(
    fn: () => Promise<T>,
    label: string,
  ): Promise<T> {
    let lastError: any;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await fn();
      } catch (err: any) {
        lastError = err;
        const status: number = err?.response?.status ?? 0;

        // Non-retryable errors
        if (status === 400 || status === 404) {
          this.logger.warn(`⛔ ${label} → ${status}, not retrying`);
          break;
        }
        if (status === 401 || status === 403) {
          this.logger.warn(`⛔ ${label} → auth error ${status}, not retrying`);
          break;
        }

        const isRateLimit = status === 429 || err?.message?.includes('429');
        const isTransient =
          err?.message?.includes('timeout') ||
          err?.message?.includes('ECONNRESET') ||
          err?.message?.includes('ETIMEDOUT') ||
          err?.message?.includes('socket');

        if ((isRateLimit || isTransient) && attempt < MAX_RETRIES) {
          const delay = RETRY_BASE_MS * attempt;
          this.logger.warn(
            `⏳ ${label} attempt ${attempt}/${MAX_RETRIES} failed, retrying in ${delay}ms`,
          );
          await new Promise((r) => setTimeout(r, delay));
        } else {
          this.logger.warn(
            `⚠️ ${label} attempt ${attempt}/${MAX_RETRIES} failed: ${err.message}`,
          );
          break;
        }
      }
    }

    throw lastError;
  }
}