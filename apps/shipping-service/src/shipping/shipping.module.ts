import { Module } from '@nestjs/common';
import { ShippingController } from './shipping.controller.js';
import { ShippingAggregatorService } from './shipping-aggregator.service.js';
import { BigShipProvider } from './providers/bigship.provider.js';
import { ShipMozoProvider } from './providers/shipmozo.provider.js';
import { ShipwalaProvider } from './providers/shipwala.provider.js';

@Module({
  controllers: [ShippingController],
  providers: [
    ShippingAggregatorService,
    BigShipProvider,
    ShipMozoProvider,
    ShipwalaProvider,
  ],
  exports: [ShippingAggregatorService],
})
export class ShippingModule {}
