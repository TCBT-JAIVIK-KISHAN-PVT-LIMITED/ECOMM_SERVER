import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import {
  ShippingProvider,
  ShippingRateRequest,
  ShippingRateResult,
} from '../interfaces/shipping-provider.interface.js';

@Injectable()
export class BigShipProvider implements ShippingProvider {
  readonly name = 'bigship';
  private readonly logger = new Logger(BigShipProvider.name);
  private axiosInstance: AxiosInstance;
  private token: string | null = null;
  private tokenExpiresAt: Date | null = null;

  constructor(private configService: ConfigService) {
    const baseURL = this.configService.get<string>('BIGSHIP_BASE_URL');
    this.axiosInstance = axios.create({
      baseURL,
      timeout: 10000,
    });
  }

  isAvailable(): boolean {
    const username = this.configService.get<string>('BIGSHIP_USERNAME');
    const password = this.configService.get<string>('BIGSHIP_PASSWORD');
    const accessKey = this.configService.get<string>('BIGSHIP_ACCESS_KEY');
    return !!(username && password && accessKey);
  }

  /**
   * Authenticate with BigShip and cache the Bearer token.
   * Re-authenticates automatically when the token is expired.
   */
  private async authenticate(): Promise<string> {
    // Return cached token if still valid (with 5 min buffer)
    if (this.token && this.tokenExpiresAt) {
      const bufferMs = 5 * 60 * 1000;
      if (new Date().getTime() < this.tokenExpiresAt.getTime() - bufferMs) {
        return this.token;
      }
    }

    this.logger.log('Authenticating with BigShip API...');

    const response = await this.axiosInstance.post('/api/outbound/login', {
      username: this.configService.get<string>('BIGSHIP_USERNAME'),
      password: this.configService.get<string>('BIGSHIP_PASSWORD'),
      access_key: this.configService.get<string>('BIGSHIP_ACCESS_KEY'),
    });

    if (!response.data?.status || !response.data?.data?.token) {
      throw new Error(
        `BigShip login failed: ${JSON.stringify(response.data)}`,
      );
    }

    this.token = response.data.data.token;
    this.tokenExpiresAt = new Date(response.data.data.tokenExpiringAt);

    this.logger.log(
      `BigShip auth successful, token expires at ${this.tokenExpiresAt.toISOString()}`,
    );

    return this.token!;
  }

  async calculateRate(
    request: ShippingRateRequest,
  ): Promise<ShippingRateResult[]> {
    const token = await this.authenticate();

    // Convert weight from grams to kg for BigShip API
    const weightInKg = (request.weight / 1000).toFixed(2);

    // Determine segment type: < 10kg is B2C, >= 10kg handled by ShipMozo
    const segmentType = 'domestic_b2c';

    const payload = {
      segment_type: segmentType,
      sourcePincode: request.pickupPincode,
      destPincode: request.deliveryPincode,
      invoiceValue: request.orderAmount || 1000,
      paymentModeId: 1, // Prepaid
      riskTypeId: 2, // Owner Risk
      boxes: [
        {
          no_of_box: '1',
          box_length: request.dimensions?.[0]?.length?.toString() || '22',
          box_width: request.dimensions?.[0]?.width?.toString() || '10',
          box_height: request.dimensions?.[0]?.height?.toString() || '10',
          box_dead_weight: weightInKg,
        },
      ],
    };

    this.logger.log(
      `BigShip rate request: ${JSON.stringify(payload)}`,
    );

    const response = await this.axiosInstance.post(
      '/api/outbound/user-rate-calculator',
      payload,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      },
    );

    const rates = response.data?.data || [];

    if (!Array.isArray(rates) || rates.length === 0) {
      this.logger.warn('BigShip returned no rates');
      return [];
    }

    return rates.map((rate: any) => ({
      provider: this.name,
      courier: rate.courierName || 'Unknown',
      totalCharges: Number(rate.totalCharge) || 0,
      estimatedDelivery: rate.tat || undefined,
      raw: rate,
    }));
  }
}
