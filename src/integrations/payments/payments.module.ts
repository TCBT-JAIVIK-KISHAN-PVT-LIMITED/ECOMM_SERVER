import { Module } from '@nestjs/common';
import { ZohoPaymentGatewayService } from './zoho-payment-gateway.service';
import { ZohoModule } from '../../zoho/zoho.module';
import { ZohoPaymentsModule } from '../../zoho/payments/payments.module';
import { ZohoPaymentLinksService } from './zoho-payment-links.service';

@Module({
    imports: [
        ZohoModule,
        ZohoPaymentsModule
    ],
    providers: [
        ZohoPaymentGatewayService,
        ZohoPaymentLinksService,
    ],
    exports: [ZohoPaymentGatewayService, ZohoPaymentLinksService],
})
export class PaymentsModule { }