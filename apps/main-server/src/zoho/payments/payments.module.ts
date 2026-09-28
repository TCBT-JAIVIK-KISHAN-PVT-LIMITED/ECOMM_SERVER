import { Module } from '@nestjs/common';
import { ZohoPaymentsService } from './payments.service';
import { MongooseModule } from '@nestjs/mongoose';
import { ZohoToken, ZohoTokenSchema } from '../schemas/zoho-token.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ZohoToken.name, schema: ZohoTokenSchema },
    ]),
  ],
  providers: [ZohoPaymentsService],
  exports: [ZohoPaymentsService],
})
export class ZohoPaymentsModule {}
