import {
  Controller,
  Get,
  Query,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ZohoAuthService } from './core/zoho-auth.service';
import { ZohoPaymentsService } from './payments/payments.service';
import type { ZohoService } from './config/zoho-scope.config';

@Controller('callback')
export class CallbackController {
  constructor(
    private readonly zohoAuthService: ZohoAuthService,
    private readonly zohoPaymentsService: ZohoPaymentsService,
  ) {}

  @Get()
  async handleCallback(
    @Query('code') code?: string,
    @Query('state') service?: ZohoService,
  ) {
    if (!code) {
      throw new BadRequestException('Authorization code missing');
    }

    if (!service) {
      throw new BadRequestException('Service (state) missing');
    }

    const allowedServices: ZohoService[] = ['crm', 'inventory', 'payments'];

    if (!allowedServices.includes(service)) {
      throw new BadRequestException(`Invalid service: ${service}`);
    }

    try {
      if (service === 'payments') {
        const data = await this.zohoPaymentsService.exchangeCodeForToken(code);

        return {
          message: 'Zoho Payments token saved successfully',
          data,
        };
      }

      const data = await this.zohoAuthService.exchangeCodeForToken(
        code,
        service,
      );

      return {
        success: true,
        message: `Zoho token saved successfully`,
        service,
        expires_in: data.expires_in,
        scope: data.scope,
      };
    } catch (error: any) {
      console.error('Zoho Callback Error:', error);

      throw new InternalServerErrorException('Failed to exchange Zoho token');
    }
  }
}
