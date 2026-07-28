import {
  Controller,
  Post,
  Req,
  Body,
  UnauthorizedException,
  Get,
  Param,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { OrdersService } from '../../modules/orders/orders.service';
import { ZohoPaymentLinksService } from './zoho-payment-links.service';
import { CreatePaymentLinkDto } from './dto/create-payment-link.dto';
import { JwtAuthGuard } from '../../modules/auth/jwt-auth.guard';
import { CurrentUser } from '../../modules/auth/current-user.decorator';
import type { AuthenticatedRequestUser } from '../../modules/auth/jwt.strategy';

interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

@Controller('payments')
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(
    private readonly ordersService: OrdersService,
    private readonly configService: ConfigService,
    private readonly zohoPaymentLinksService: ZohoPaymentLinksService,
  ) {}

  @Post('webhook')
  async handleWebhook(@Req() req: RawBodyRequest) {
    // Zoho sends signature as 'x-zoho-webhook-signature: t=<ts>,v=<hex>'
    const sigHeader =
      (req.headers['x-zoho-webhook-signature'] as string) || '';

    this.logger.log(
      `[Webhook] x-zoho-webhook-signature: ${sigHeader || '❌ MISSING'}`,
    );

    const secret = this.configService.getOrThrow<string>(
      'ZOHO_PAYMENTS_SIGNING_KEY',
    );

    const rawBody = req.body as Buffer;

    if (!rawBody || !(rawBody instanceof Buffer)) {
      this.logger.error('[Webhook] ❌ Missing or non-Buffer raw body');
      throw new UnauthorizedException('Missing raw body');
    }

    // Parse t=<timestamp>,v=<hex> from the header
    const timestamp = sigHeader.match(/t=(\d+)/)?.[1] ?? '';
    const receivedV = sigHeader.match(/v=([a-f0-9]+)/i)?.[1] ?? '';

    this.logger.log(`[Webhook] Parsed timestamp: ${timestamp || '❌ MISSING'}`);
    this.logger.log(`[Webhook] Parsed v: ${receivedV || '❌ MISSING'}`);

    const signatureValid = this.verifySignature(
      rawBody,
      timestamp,
      receivedV,
      secret,
    );
    this.logger.log(`[Webhook] Signature valid? ${signatureValid}`);

    if (!signatureValid) {
      this.logger.error('[Webhook] ⛔ Invalid signature — rejecting');
      throw new UnauthorizedException('Invalid webhook signature');
    }

    // ✅ Parse JSON manually
    const body = JSON.parse(rawBody.toString());

    const eventType = body.event_type;
    const payment = body.event_object?.payment;

    const paymentId = payment?.payment_id;
    const amount = payment?.amount;
    const orderId = payment?.reference_number;

    this.logger.log(
      `[Webhook] event_type: ${eventType}, orderId: ${orderId}, paymentId: ${paymentId}`,
    );

    if (!orderId) return { ok: false };

    if (eventType === 'payment.succeeded') {
      await this.ordersService.handlePaymentSuccess(orderId, paymentId, amount);
    } else if (eventType === 'payment.failed') {
      await this.ordersService.handlePaymentFailure(orderId);
    }

    return { received: true };
  }

  private verifySignature(
    rawBody: Buffer,
    timestamp: string,
    receivedV: string,
    secret: string,
  ): boolean {
    if (!receivedV) {
      this.logger.warn(
        '[verifySignature] ⚠️ No v= value in signature header',
      );
      return false;
    }

    // ✅ CONFIRMED algorithm: HMAC-SHA256(secret, timestamp + "." + rawBody) in hex
    if (timestamp) {
      const message = Buffer.concat([Buffer.from(timestamp + '.'), rawBody]);
      const computed = crypto
        .createHmac('sha256', secret)
        .update(message)
        .digest('hex');

      if (computed.toLowerCase() === receivedV.toLowerCase()) {
        this.logger.log('[verifySignature] ✅ Matched!');
        return true;
      }
    }

    // Fallback: HMAC-SHA256(secret, rawBody) in hex
    const fallback = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');

    if (fallback.toLowerCase() === receivedV.toLowerCase()) {
      this.logger.log('[verifySignature] ✅ Matched on fallback (rawBody only)');
      return true;
    }

    this.logger.error('[verifySignature] ❌ No match found');
    return false;
  }

  @UseGuards(JwtAuthGuard)
  @Get('verify/:orderId')
  async verifyPayment(
    @Param('orderId') orderId: string,
    @CurrentUser() user: AuthenticatedRequestUser,
  ) {
    return this.ordersService.verifyAndConfirmOrder(orderId, user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('payment-link')
  async createPaymentLink(@Body() body: CreatePaymentLinkDto) {
    return this.zohoPaymentLinksService.createPaymentLink(body);
  }
}
