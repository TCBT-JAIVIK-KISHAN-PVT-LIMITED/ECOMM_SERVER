import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import axios, { AxiosError, AxiosInstance } from 'axios';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ShippingService {
  private readonly logger = new Logger(ShippingService.name);
  private axiosInstance: AxiosInstance;

  constructor(private configService: ConfigService) {
    this.axiosInstance = axios.create({
      baseURL: this.configService.get<string>('SHIPMOZO_BASE_URL'),
      timeout: 5000,
    });
  }

  async calculateRate(
    weight: number,
    deliveryPincode: number,
    type_of_package: string,
  ) {
    const payload = {
      pickup_pincode: 482003,
      delivery_pincode: deliveryPincode,
      payment_type: 'PREPAID',
      shipment_type: 'FORWARD',
      order_amount: 1000,
      type_of_package,
      rov_type: 'ROV_OWNER',
      cod_amount: 0,
      weight,
      dimensions: [
        {
          no_of_box: 1,
          length: 22,
          width: 10,
          height: 10,
        },
      ],
    };

    try {
      const response = await this.axiosInstance.post(
        '/app/api/v1/rate-calculator',
        payload,
        {
          headers: {
            'public-key': this.configService.get<string>('SHIPMOZO_PUBLIC_KEY'),
            'private-key': this.configService.get<string>(
              'SHIPMOZO_PRIVATE_KEY',
            ),
            'Content-Type': 'application/json',
          },
        },
      );

      const rates = response?.data?.data || [];

      if (!rates.length) {
        throw new HttpException(
          'No shipping rates available',
          HttpStatus.BAD_REQUEST,
        );
      }

      const delhiveryOption = rates.find((r: any) =>
        r.name?.toLowerCase().includes('delhivery'),
      );

      let selected;

      if (delhiveryOption) {
        selected = delhiveryOption;
      } else {
        selected = rates.reduce((min: any, curr: any) =>
          curr.total_charges < min.total_charges ? curr : min,
        );
      }

      return {
        success: true,
        shippingCharge: Math.ceil(Number(selected.total_charges) || 0),
        courier: selected.name,
        estimatedDelivery: selected.estimated_delivery,
        fullResponse: selected,
      };
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        const err = error as AxiosError;

        this.logger.error('Shipping API failed', {
          data: err.response?.data,
          status: err.response?.status,
        });

        throw new HttpException(
          {
            success: false,
            message: 'Shipping rate calculation failed',
            error: err.response?.data || err.message,
          },
          err.response?.status || 500,
        );
      }

      this.logger.error('Unknown error', error);

      throw new HttpException(
        {
          success: false,
          message: 'Unexpected error occurred',
        },
        500,
      );
    }
  }
}
