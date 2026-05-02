import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ZohoCommerceStorefrontService } from './commerce-storefront.service';

@Module({
  imports: [ConfigModule],
  providers: [ZohoCommerceStorefrontService],
  exports: [ZohoCommerceStorefrontService],
})
export class ZohoCommerceModule {}
