import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const logger = new Logger('ShippingService');
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('SHIPPING_SERVICE_PORT') || 3001;

  app.enableCors();

  await app.listen(port);
  logger.log(`🚚 Shipping microservice running on port ${port}`);
}

bootstrap();
