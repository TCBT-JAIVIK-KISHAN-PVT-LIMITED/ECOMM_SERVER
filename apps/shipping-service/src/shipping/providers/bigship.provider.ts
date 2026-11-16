import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import {
  ShippingProvider,
  ShippingRateRequest,
  ShippingRateResult,
} from '../interfaces/shipping-provider.interface.js';

// ─── Pincode prefix → Indian state mapping ──────────────────────────────────
// First two digits of an Indian PIN code identify the postal circle (state/UT).
const PINCODE_STATE_MAP: Record<string, string> = {
  '11': 'Delhi',
  '12': 'Haryana',
  '13': 'Haryana',
  '14': 'Punjab',
  '15': 'Punjab',
  '16': 'Punjab',
  '17': 'Himachal Pradesh',
  '18': 'Jammu & Kashmir',
  '19': 'Jammu & Kashmir',
  '20': 'Uttar Pradesh',
  '21': 'Uttar Pradesh',
  '22': 'Uttar Pradesh',
  '23': 'Uttar Pradesh',
  '24': 'Uttar Pradesh',
  '25': 'Uttar Pradesh',
  '26': 'Uttar Pradesh',
  '27': 'Uttar Pradesh',
  '28': 'Uttar Pradesh',
  '30': 'Rajasthan',
  '31': 'Rajasthan',
  '32': 'Rajasthan',
  '33': 'Rajasthan',
  '34': 'Rajasthan',
  '36': 'Gujarat',
  '37': 'Gujarat',
  '38': 'Gujarat',
  '39': 'Gujarat',
  '40': 'Maharashtra',
  '41': 'Maharashtra',
  '42': 'Maharashtra',
  '43': 'Maharashtra',
  '44': 'Maharashtra',
  '45': 'Madhya Pradesh',
  '46': 'Madhya Pradesh',
  '47': 'Madhya Pradesh',
  '48': 'Madhya Pradesh',
  '49': 'Chhattisgarh',
  '50': 'Telangana',
  '51': 'Telangana',
  '52': 'Andhra Pradesh',
  '53': 'Andhra Pradesh',
  '55': 'Karnataka',
  '56': 'Karnataka',
  '57': 'Karnataka',
  '58': 'Karnataka',
  '59': 'Karnataka',
  '60': 'Tamil Nadu',
  '61': 'Tamil Nadu',
  '62': 'Tamil Nadu',
  '63': 'Tamil Nadu',
  '64': 'Tamil Nadu',
  '67': 'Kerala',
  '68': 'Kerala',
  '69': 'Kerala',
  '70': 'West Bengal',
  '71': 'West Bengal',
  '72': 'West Bengal',
  '73': 'West Bengal',
  '74': 'West Bengal',
  '75': 'Odisha',
  '76': 'Odisha',
  '77': 'Odisha',
  '78': 'Assam',
  '79': 'Arunachal Pradesh',
  '80': 'Bihar',
  '81': 'Bihar',
  '82': 'Bihar',
  '83': 'Bihar',
  '84': 'Bihar',
  '85': 'Jharkhand',
  '10': 'Delhi',
  '35': 'Gujarat',
  '65': 'Kerala',
  '66': 'Kerala',
};

function getStateFromPincode(pincode: number | string): string {
  const prefix = String(pincode).slice(0, 2);
  return PINCODE_STATE_MAP[prefix] || 'Madhya Pradesh';
}

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
      throw new Error(`BigShip login failed: ${JSON.stringify(response.data)}`);
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

    // Resolve state from pincode — BigShip requires sourceState & destState
    const sourceState = getStateFromPincode(request.pickupPincode);
    const destState = getStateFromPincode(request.deliveryPincode);

    const payload = {
      segment_type: segmentType,
      sourcePincode: request.pickupPincode,
      destPincode: request.deliveryPincode,
      sourceState,
      destState,
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

    this.logger.log(`BigShip rate request: ${JSON.stringify(payload)}`);

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
