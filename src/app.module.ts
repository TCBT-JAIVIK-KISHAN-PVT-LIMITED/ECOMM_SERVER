import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ZohoModule } from './zoho/zoho.module';
import { ProductsModule } from './modules/products/products.module';
import { ScheduleModule } from '@nestjs/schedule';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { OrdersModule } from './modules/orders/orders.module';
import { UsersModule } from './modules/users/users.module';
import { AuthModule } from './modules/auth/auth.module';
import { CallbackController } from './zoho/callback.controller';
import { CategoryModule } from './modules/categories/categories.module';
import { RedisModule } from './common/redis/redis.module';
import { CartModule } from './modules/cart/cart.module';
import { WishlistModule } from './modules/wishlist/wishlist.module';
import { ZohoImageSyncModule } from './integrations/zoho-image-sync/zoho-image-sync.module';
import { ZohoPaymentsModule } from './zoho/payments/payments.module';
import { ShippingModule } from './integrations/shipping/shipping.module';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{
      ttl: 60000,   // 60 seconds window
      limit: 100,   // max 100 requests per window per IP
    }]),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        uri: configService.get<string>('MONGO_URI'),
      }),
    }),
    ZohoModule,
    ZohoPaymentsModule,
    ProductsModule,
    ScheduleModule.forRoot(),
    OrdersModule,
    UsersModule,
    AuthModule,
    CategoryModule,
    RedisModule,
    CartModule,
    WishlistModule,
    ZohoImageSyncModule,
    ShippingModule,
  ],
  controllers: [AppController, CallbackController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
