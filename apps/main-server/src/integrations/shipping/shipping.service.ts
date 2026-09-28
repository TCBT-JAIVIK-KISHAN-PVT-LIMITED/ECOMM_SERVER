import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import axios, { AxiosError, AxiosInstance } from 'axios';
import { ConfigService } from '@nestjs/config';

/**
 * ShippingService — Delegates rate calculation to the shipping microservice.
 *
 * The method signature is preserved so that OrdersService.createOrder()
 * requires zero changes.
 */
@Injectable()
export class ShippingService {
  private readonly logger = new Logger(ShippingService.name);
  private axiosInstance: AxiosInstance;

  constructor(private configService: ConfigService) {
    const shippingServiceUrl =
      this.configService.get<string>('SHIPPING_SERVICE_URL') ||
      'http://localhost:3001';

    this.axiosInstance = axios.create({
      baseURL: shippingServiceUrl,
      timeout: 15000, // generous timeout since microservice calls external APIs
    });
  }

  async calculateRate(
    weight: number,
    deliveryPincode: number,
    type_of_package: string,
  ) {
    this.logger.log(
      `Delegating rate calculation to shipping microservice: weight=${weight}, pincode=${deliveryPincode}, package=${type_of_package}`,
    );

    try {
      const response = await this.axiosInstance.post('/shipping/rates', {
        pickupPincode: 482003,
        deliveryPincode: deliveryPincode,
        weight: weight,
        packageType: type_of_package,
        orderAmount: 1000,
      });

      const data = response.data;

      return {
        success: data.success,
        shippingCharge: data.shippingCharge,
        courier: data.courier,
        estimatedDelivery: data.estimatedDelivery,
        fullResponse: data,
      };
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        const err = error as AxiosError;

        this.logger.error('Shipping microservice call failed', {
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

      this.logger.error('Unknown error calling shipping microservice', error);

      throw new HttpException(
        {
          success: false,
          message: 'Unexpected error occurred',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
