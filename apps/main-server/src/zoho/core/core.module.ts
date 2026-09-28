import { Module } from '@nestjs/common';
import { ZohoAuthService } from './zoho-auth.service';
import { ZohoHttpService } from './zoho-http.service';
import { MongooseModule } from '@nestjs/mongoose';
import { ZohoToken, ZohoTokenSchema } from '../schemas/zoho-token.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ZohoToken.name, schema: ZohoTokenSchema },
    ]),
  ],
  providers: [ZohoAuthService, ZohoHttpService],
  exports: [ZohoAuthService, ZohoHttpService],
})
export class CoreModule {}
