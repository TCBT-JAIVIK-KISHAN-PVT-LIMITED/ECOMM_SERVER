import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Query,
  UsePipes,
  ValidationPipe,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ShippingAggregatorService } from './shipping-aggregator.service.js';
import { ShipwalaProvider } from './providers/shipwala.provider.js';
import { CalculateRateDto } from './dto/calculate-rate.dto.js';

@Controller('shipping')
export class ShippingController {
  constructor(
    private readonly shippingAggregatorService: ShippingAggregatorService,
    private readonly shipwalaProvider: ShipwalaProvider,
  ) {}

  // ─── Rate Calculation ────────────────────────────────────────────────────

  /** POST /shipping/rates — Aggregated shipping rate (BigShip / ShipMozo / Shipwale) */
  @Post('rates')
  @UsePipes(new ValidationPipe({ transform: true }))
  async calculateRate(@Body() body: CalculateRateDto) {
    return this.shippingAggregatorService.calculateRate({
      pickupPincode: body.pickupPincode,
      deliveryPincode: body.deliveryPincode,
      weight: body.weight,
      packageType: body.packageType,
      orderAmount: body.orderAmount,
    });
  }

  // ─── Pincode Serviceability ──────────────────────────────────────────────

  /** GET /shipping/pincode/:pin — Check if a destination pincode is serviceable (incl. ODA zone detection) */
  @Get('pincode/:pin')
  async checkPincode(@Param('pin') pin: string) {
    if (!this.shipwalaProvider.isAvailable()) {
      throw new HttpException(
        'Shipwale provider is not configured',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return this.shipwalaProvider.checkPincode(pin);
  }

  // ─── Live Tracking ────────────────────────────────────────────────────────

  /**
   * GET /shipping/tracking/:identifier — Quick shipment status
   * GET /shipping/tracking/:identifier?full=true — Full scan timeline
   *
   * :identifier can be Shipwale Order ID (SWXD...), carrier AWB number, or store reference
   */
  @Get('tracking/:identifier')
  async getTracking(
    @Param('identifier') identifier: string,
    @Query('full') full?: string,
  ) {
    if (!this.shipwalaProvider.isAvailable()) {
      throw new HttpException(
        'Shipwale provider is not configured',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    const comprehensive = full === 'true' || full === '1';
    const data = await this.shipwalaProvider.getTracking(
      identifier,
      comprehensive,
    );
    return { success: true, data };
  }

  // ─── Shipping Label ───────────────────────────────────────────────────────

  /** GET /shipping/label/:id — Retrieve shipping label as Base64 PDF for a manifested order */
  @Get('label/:id')
  async getLabel(@Param('id') id: string) {
    if (!this.shipwalaProvider.isAvailable()) {
      throw new HttpException(
        'Shipwale provider is not configured',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    const label = await this.shipwalaProvider.getShippingLabel(id);
    if (!label) {
      throw new HttpException(
        'Shipping label not available for this order',
        HttpStatus.NOT_FOUND,
      );
    }
    return { success: true, data: label };
  }

  // ─── Order Management ─────────────────────────────────────────────────────

  /** GET /shipping/orders/:id — Get full shipment details from Shipwale */
  @Get('orders/:id')
  async getOrder(@Param('id') id: string) {
    if (!this.shipwalaProvider.isAvailable()) {
      throw new HttpException(
        'Shipwale provider is not configured',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    const data = await this.shipwalaProvider.getOrderDetails(id);
    return { success: true, data };
  }

  /** DELETE /shipping/orders/:id — Cancel or delete a Shipwale order */
  @Delete('orders/:id')
  async cancelOrder(@Param('id') id: string) {
    if (!this.shipwalaProvider.isAvailable()) {
      throw new HttpException(
        'Shipwale provider is not configured',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    const result = await this.shipwalaProvider.cancelOrder(id);
    return result;
  }

  // ─── B2C Order Creation ───────────────────────────────────────────────────

  /** POST /shipping/orders/b2c — Create a B2C single-parcel shipment via Shipwale */
  @Post('orders/b2c')
  async createB2COrder(@Body() body: any) {
    if (!this.shipwalaProvider.isAvailable()) {
      throw new HttpException(
        'Shipwale provider is not configured',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return this.shipwalaProvider.createB2COrder(body);
  }

  // ─── B2B Order Creation ───────────────────────────────────────────────────

  /** POST /shipping/orders/b2b — Create a B2B heavy cargo shipment via Shipwale */
  @Post('orders/b2b')
  async createB2BOrder(@Body() body: any) {
    if (!this.shipwalaProvider.isAvailable()) {
      throw new HttpException(
        'Shipwale provider is not configured',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return this.shipwalaProvider.createB2BOrder(body);
  }

  // ─── Pickup Request ───────────────────────────────────────────────────────

  /** POST /shipping/pickup — Schedule a carrier pickup at a warehouse */
  @Post('pickup')
  async schedulePickup(@Body() body: any) {
    if (!this.shipwalaProvider.isAvailable()) {
      throw new HttpException(
        'Shipwale provider is not configured',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return this.shipwalaProvider.schedulePickup(body);
  }

  // ─── Volumetric Weight ────────────────────────────────────────────────────

  /** POST /shipping/volumetric — Offline volumetric weight estimator */
  @Post('volumetric')
  async calculateVolumetric(@Body() body: { boxes: any[] }) {
    if (!this.shipwalaProvider.isAvailable()) {
      throw new HttpException(
        'Shipwale provider is not configured',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    const data = await this.shipwalaProvider.calculateVolumetric(body.boxes);
    return { success: true, data };
  }

  // ─── Token Verify / Health ────────────────────────────────────────────────

  /** GET /shipping/shipwale/verify — Verify Shipwale token and check wallet balance */
  @Get('shipwale/verify')
  async verifyShipwaleToken() {
    if (!this.shipwalaProvider.isAvailable()) {
      throw new HttpException(
        'Shipwale provider is not configured',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    const result = await this.shipwalaProvider.verifyToken();
    return { success: true, ...result };
  }
}
