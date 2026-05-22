import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
} from '@nestjs/common';

import { ConfigService } from '@nestjs/config';

import { ProductSyncService } from '../../modules/products/product-sync.service';

@Controller('zoho')
export class ZohoImageSyncController {
  private readonly logger = new Logger(
    ZohoImageSyncController.name,
  );

  private processingItems = new Set<string>();

  constructor(
    private readonly productSyncService: ProductSyncService,
    private readonly configService: ConfigService,
  ) {}

  // ─────────────────────────────────────────
  // Validate webhook token
  // ─────────────────────────────────────────
  private validateToken(token: string): boolean {
    const expected =
      this.configService.get<string>(
        'ZOHO_WEBHOOK_SECRET',
      );

    if (expected && token !== expected) {
      this.logger.warn(
        '⛔ Invalid webhook token',
      );
      return false;
    }

    return true;
  }

  // ─────────────────────────────────────────
  // Extract item_id safely
  // ─────────────────────────────────────────
  private extractItemId(body: any): string | null {
    try {
      const payload = body?.JSONString
        ? JSON.parse(body.JSONString)
        : body;

      return (
        payload?.item_id ||
        payload?.itemId ||
        payload?.id ||
        null
      );
    } catch {
      return null;
    }
  }

  // ─────────────────────────────────────────
  // Duplicate processing guard
  // ─────────────────────────────────────────
  private isAlreadyProcessing(
    itemId: string,
  ): boolean {
    if (this.processingItems.has(itemId)) {
      this.logger.warn(
        `⚠️ Already processing ${itemId}`,
      );

      return true;
    }

    return false;
  }

  // ─────────────────────────────────────────
  // CREATED
  // ─────────────────────────────────────────
  @Post('webhook/created')
  @HttpCode(200)
  async handleCreated(
    @Body() body: any,
    @Headers('x-zoho-webhook-token')
    token: string,
  ) {
    return this.processWebhook(
      body,
      token,
      'created',
    );
  }

  // ─────────────────────────────────────────
  // UPDATED
  // ─────────────────────────────────────────
  @Post('webhook/updated')
  @HttpCode(200)
  async handleUpdated(
    @Body() body: any,
    @Headers('x-zoho-webhook-token')
    token: string,
  ) {
    return this.processWebhook(
      body,
      token,
      'updated',
    );
  }

  // ─────────────────────────────────────────
  // DELETED
  // ─────────────────────────────────────────
  @Post('webhook/deleted')
  @HttpCode(200)
  async handleDeleted(
    @Body() body: any,
    @Headers('x-zoho-webhook-token')
    token: string,
  ) {
    return this.processWebhook(
      body,
      token,
      'deleted',
    );
  }

  // ─────────────────────────────────────────
  // FALLBACK
  // ─────────────────────────────────────────
  @Post('webhook')
  @HttpCode(200)
  async handleFallback(
    @Body() body: any,
    @Headers('x-zoho-webhook-token')
    token: string,
  ) {
    return this.processWebhook(
      body,
      token,
      'fallback',
    );
  }

  // ─────────────────────────────────────────
  // MAIN PROCESSOR
  // ─────────────────────────────────────────
  private async processWebhook(
    body: any,
    token: string,
    event: string,
  ) {
    if (!this.validateToken(token)) {
      return {
        status: 'rejected',
      };
    }

    const itemId = this.extractItemId(body);

    this.logger.log(
      `📩 [${event.toUpperCase()}] item_id: ${itemId}`,
    );

    if (!itemId) {
      return {
        status: 'ignored',
        reason: 'no item_id',
      };
    }

    if (this.isAlreadyProcessing(itemId)) {
      return {
        status: 'ignored',
        reason: 'already processing',
      };
    }

    this.processingItems.add(itemId);

    try {
      if (event === 'deleted') {
        await this.productSyncService.deleteByZohoItemId(
          String(itemId),
        );
      } else {
        await this.productSyncService.syncSingleItem(
          String(itemId),
        );
      }

      return {
        status: 'success',
        event,
        itemId,
      };
    } catch (err: any) {
      this.logger.error(
        `❌ Webhook processing failed: ${err.message}`,
      );

      return {
        status: 'failed',
        error: err.message,
      };
    } finally {
      this.processingItems.delete(itemId);
    }
  }
}