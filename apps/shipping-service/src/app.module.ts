import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ShippingModule } from './shipping/shipping.module.js';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), ShippingModule],
})
export class AppModule {}
