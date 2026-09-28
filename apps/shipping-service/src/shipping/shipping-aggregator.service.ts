import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BigShipProvider } from './providers/bigship.provider.js';
import { ShipMozoProvider } from './providers/shipmozo.provider.js';
import { ShipwalaProvider } from './providers/shipwala.provider.js';
import { ShippingRateRequest } from './interfaces/shipping-provider.interface.js';

/**
 * Shipping Aggregator Service
 *
 * Routing rules (configurable via PRIMARY_SHIPPING_PROVIDER env var):
 *
 *  Mode: "shipwala" (PRIMARY_SHIPPING_PROVIDER=shipwala)
 *    - All requests → Shipwale (live multi-carrier quotes)
 *    - Falls back to BigShip/ShipMozo if Shipwale returns no rates
 *
 *  Mode: "legacy" (default, or PRIMARY_SHIPPING_PROVIDER=legacy)
 *    - Weight < 10 kg  → BigShip (B2C)
 *    - Weight >= 10 kg → ShipMozo (B2B)
 *    - Shipwala used as a secondary fallback when primary returns no rates
 *
 * Env vars:
 *   PRIMARY_SHIPPING_PROVIDER — "shipwala" | "legacy" (default: "legacy")
 */
@Injectable()
export class ShippingAggregatorService {
  private readonly logger = new Logger(ShippingAggregatorService.name);
  private readonly WEIGHT_THRESHOLD_GRAMS = 10000; // 10 kg

  constructor(
    private readonly bigShipProvider: BigShipProvider,
    private readonly shipMozoProvider: ShipMozoProvider,
    private readonly shipwalaProvider: ShipwalaProvider,
    private readonly configService: ConfigService,
  ) {}

  async calculateRate(request: ShippingRateRequest) {
    const { weight } = request;
    const primaryProvider =
      (this.configService.get<string>('PRIMARY_SHIPPING_PROVIDER') || 'legacy').toLowerCase();

    this.logger.log(
      `Rate request: weight=${weight}g, pickup=${request.pickupPincode}, delivery=${request.deliveryPincode}, mode=${primaryProvider}`,
    );

    try {
      if (primaryProvider === 'shipwala') {
        return await this.routeViaShipwale(request);
      } else {
        return await this.routeViaLegacy(request);
      }
    } catch (error: any) {
      if (error instanceof HttpException) throw error;

      this.logger.error(
        `Shipping rate calculation failed: ${error.message}`,
        error.stack,
      );

      throw new HttpException(
        {
          success: false,
          message: 'Shipping rate calculation failed',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ─── Shipwale Primary Route ──────────────────────────────────────────────

  private async routeViaShipwale(request: ShippingRateRequest) {
    if (!this.shipwalaProvider.isAvailable()) {
      this.logger.warn(
        'Shipwale is primary but not configured — falling back to legacy routing',
      );
      return this.routeViaLegacy(request);
    }

    this.logger.log('Routing to Shipwale (primary provider)');

    let rates = await this.shipwalaProvider.calculateRate(request);

    if (!rates.length) {
      this.logger.warn(
        'Shipwale returned no rates — falling back to legacy routing',
      );
      return this.routeViaLegacy(request);
    }

    // Pick cheapest available rate
    const best = rates.reduce((min, curr) =>
      curr.totalCharges < min.totalCharges ? curr : min,
    );

    return {
      success: true,
      shippingCharge: Math.ceil(best.totalCharges),
      courier: best.courier,
      provider: best.provider,
      estimatedDelivery: best.estimatedDelivery,
      allRates: rates,
    };
  }

  // ─── Legacy Route (BigShip / ShipMozo) ──────────────────────────────────

  private async routeViaLegacy(request: ShippingRateRequest) {
    const { weight } = request;

    if (weight < this.WEIGHT_THRESHOLD_GRAMS) {
      return this.routeViaBigShip(request);
    } else {
      return this.routeViaShipMozo(request);
    }
  }

  private async routeViaBigShip(request: ShippingRateRequest) {
    this.logger.log(
      `Weight ${request.weight}g (< ${this.WEIGHT_THRESHOLD_GRAMS}g) → routing to BigShip`,
    );

    if (!this.bigShipProvider.isAvailable()) {
      // Try Shipwale as fallback if configured
      if (this.shipwalaProvider.isAvailable()) {
        this.logger.warn(
          'BigShip not configured — falling back to Shipwale for this request',
        );
        return this.routeViaShipwale(request);
      }
      throw new HttpException(
        'BigShip provider is not configured',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const rates = await this.bigShipProvider.calculateRate(request);

    if (!rates.length) {
      // Try Shipwale as fallback
      if (this.shipwalaProvider.isAvailable()) {
        this.logger.warn(
          'BigShip returned no rates — trying Shipwale as fallback',
        );
        const swRates = await this.shipwalaProvider.calculateRate(request);
        if (swRates.length) {
          const best = swRates.reduce((min, curr) =>
            curr.totalCharges < min.totalCharges ? curr : min,
          );
          return {
            success: true,
            shippingCharge: Math.ceil(best.totalCharges),
            courier: best.courier,
            provider: best.provider,
            estimatedDelivery: best.estimatedDelivery,
            allRates: swRates,
          };
        }
      }
      throw new HttpException(
        'No shipping rates available from BigShip',
        HttpStatus.BAD_REQUEST,
      );
    }

    const best = rates.reduce((min, curr) =>
      curr.totalCharges < min.totalCharges ? curr : min,
    );

    return {
      success: true,
      shippingCharge: Math.ceil(best.totalCharges),
      courier: best.courier,
      provider: best.provider,
      estimatedDelivery: best.estimatedDelivery,
      allRates: rates,
    };
  }

  private async routeViaShipMozo(request: ShippingRateRequest) {
    this.logger.log(
      `Weight ${request.weight}g (>= ${this.WEIGHT_THRESHOLD_GRAMS}g) → routing to ShipMozo (B2B)`,
    );

    if (!this.shipMozoProvider.isAvailable()) {
      // Try Shipwale as fallback if configured
      if (this.shipwalaProvider.isAvailable()) {
        this.logger.warn(
          'ShipMozo not configured — falling back to Shipwale for this request',
        );
        return this.routeViaShipwale(request);
      }
      throw new HttpException(
        'ShipMozo provider is not configured',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const rates = await this.shipMozoProvider.calculateRate(request);

    if (!rates.length) {
      // Try Shipwale as fallback
      if (this.shipwalaProvider.isAvailable()) {
        this.logger.warn(
          'ShipMozo returned no rates — trying Shipwale as fallback',
        );
        const swRates = await this.shipwalaProvider.calculateRate(request);
        if (swRates.length) {
          const best = swRates.reduce((min, curr) =>
            curr.totalCharges < min.totalCharges ? curr : min,
          );
          return {
            success: true,
            shippingCharge: Math.ceil(best.totalCharges),
            courier: best.courier,
            provider: best.provider,
            estimatedDelivery: best.estimatedDelivery,
            allRates: swRates,
          };
        }
      }
      throw new HttpException(
        'No shipping rates available from ShipMozo',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Prefer Delhivery if available, otherwise cheapest
    const delhiveryOption = rates.find((r) =>
      r.courier?.toLowerCase().includes('delhivery'),
    );

    const best =
      delhiveryOption ||
      rates.reduce((min, curr) =>
        curr.totalCharges < min.totalCharges ? curr : min,
      );

    return {
      success: true,
      shippingCharge: Math.ceil(best.totalCharges),
      courier: best.courier,
      provider: best.provider,
      estimatedDelivery: best.estimatedDelivery,
      allRates: rates,
    };
  }
}
