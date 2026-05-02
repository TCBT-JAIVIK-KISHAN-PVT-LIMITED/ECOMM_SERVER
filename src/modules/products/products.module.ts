import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Product, ProductSchema } from './schemas/product.schema';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { ZohoModule } from '../../zoho/zoho.module';
import { ZohoImageSyncModule } from '../../integrations/zoho-image-sync/zoho-image-sync.module';
import { ZohoCommerceModule } from '../../zoho/commerce/commerce.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Product.name, schema: ProductSchema },
    ]),
    ZohoModule,
    ZohoImageSyncModule,
    ZohoCommerceModule,
  ],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [MongooseModule],
})
export class ProductsModule {}