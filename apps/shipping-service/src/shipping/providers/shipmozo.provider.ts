import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import {
  ShippingProvider,
  ShippingRateRequest,
  ShippingRateResult,
} from '../interfaces/shipping-provider.interface.js';

@Injectable()
export class ShipMozoProvider implements ShippingProvider {
  readonly name = 'shipmozo';
  private readonly logger = new Logger(ShipMozoProvider.name);
  private axiosInstance: AxiosInstance;

  constructor(private configService: ConfigService) {
    this.axiosInstance = axios.create({
      baseURL: this.configService.get<string>('SHIPMOZO_BASE_URL'),
      timeout: 5000,
    });
  }

  isAvailable(): boolean {
    const publicKey = this.configService.get<string>('SHIPMOZO_PUBLIC_KEY');
    const privateKey = this.configService.get<string>('SHIPMOZO_PRIVATE_KEY');
    return !!(publicKey && privateKey);
  }

  async calculateRate(
    request: ShippingRateRequest,
  ): Promise<ShippingRateResult[]> {
    // ShipMozo is used for B2B (weight >= 10kg)
    const payload = {
      pickup_pincode: request.pickupPincode,
      delivery_pincode: request.deliveryPincode,
      payment_type: 'PREPAID',
      shipment_type: 'FORWARD',
      order_amount: request.orderAmount || 1000,
      type_of_package: 'B2B', // Always B2B for ShipMozo (>= 10kg)
      rov_type: 'ROV_OWNER',
      cod_amount: 0,
      weight: request.weight,
      dimensions: [
        {
          no_of_box: request.dimensions?.[0]?.quantity || 1,
          length: request.dimensions?.[0]?.length || 22,
          width: request.dimensions?.[0]?.width || 10,
          height: request.dimensions?.[0]?.height || 10,
        },
      ],
    };

    this.logger.log(`ShipMozo rate request: ${JSON.stringify(payload)}`);

    const response = await this.axiosInstance.post(
      '/app/api/v1/rate-calculator',
      payload,
      {
        headers: {
          'public-key': this.configService.get<string>('SHIPMOZO_PUBLIC_KEY'),
          'private-key': this.configService.get<string>('SHIPMOZO_PRIVATE_KEY'),
          'Content-Type': 'application/json',
        },
      },
    );

    const rates = response?.data?.data || [];

    if (!Array.isArray(rates) || rates.length === 0) {
      this.logger.warn('ShipMozo returned no rates');
      return [];
    }

    return rates.map((rate: any) => ({
      provider: this.name,
      courier: rate.name || 'Unknown',
      totalCharges: Number(rate.total_charges) || 0,
      estimatedDelivery: rate.estimated_delivery || undefined,
      raw: rate,
    }));
  }
}
