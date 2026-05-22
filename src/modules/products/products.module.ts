import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { Product, ProductSchema } from './schemas/product.schema';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';

import { ZohoModule } from '../../zoho/zoho.module';
import { ZohoImageSyncModule } from '../../integrations/zoho-image-sync/zoho-image-sync.module';

import { ProductSyncService } from './product-sync.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: Product.name,
        schema: ProductSchema,
      },
    ]),

    ZohoModule,

    forwardRef(() => ZohoImageSyncModule),
  ],

  controllers: [ProductsController],

  providers: [
    ProductsService,
    ProductSyncService,
  ],

  exports: [
    ProductsService, ProductSyncService,
  ],
})
export class ProductsModule {}