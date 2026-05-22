import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { ZohoImageSyncController } from './zoho-image-sync.controller';
import { ZohoImageSyncService } from './zoho-image-sync.service';

import { S3UploadService } from '../../common/s3-upload.service';

import { CoreModule } from '../../zoho/core/core.module';
import { ZohoModule } from '../../zoho/zoho.module';

import { ProductsModule } from '../../modules/products/products.module';

@Module({
  imports: [
    ConfigModule,
    CoreModule,
    ZohoModule,

    forwardRef(() => ProductsModule),
  ],

  controllers: [ZohoImageSyncController],

  providers: [
    ZohoImageSyncService,
    S3UploadService,
  ],

  exports: [
    ZohoImageSyncService,
  ],
})
export class ZohoImageSyncModule {}