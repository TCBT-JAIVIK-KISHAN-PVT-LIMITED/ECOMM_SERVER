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
    const signature = req.headers['x-zoho-webhook-token'] as string;

    const secret = this.configService.getOrThrow<string>(
      'ZOHO_PAYMENTS_SIGNING_KEY',
    );

    const rawBody = req.body as Buffer;

    if (!rawBody) {
      throw new UnauthorizedException('Missing raw body');
    }

    if (!this.verifySignature(rawBody, signature, secret)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    // ✅ Parse JSON manually
    const body = JSON.parse(rawBody.toString());

    const eventType = body.event_type;
    const payment = body.event_object?.payment;

    const paymentId = payment?.payment_id;
    const amount = payment?.amount;
    const orderId = payment?.reference_number;

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
    signature: string,
    secret: string,
  ): boolean {
    if (!signature) return false;

    const expectedHash = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('base64'); // ✅ Zoho sends base64, not hex

    return crypto.timingSafeEqual(
      Buffer.from(expectedHash),
      Buffer.from(signature),
    );
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
