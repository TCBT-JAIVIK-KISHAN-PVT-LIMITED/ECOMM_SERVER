import {
    Injectable,
    InternalServerErrorException,
} from '@nestjs/common';
import axios, { AxiosError } from 'axios';
import { ConfigService } from '@nestjs/config';
import { ZohoPaymentsService } from '../../zoho/payments/payments.service';

@Injectable()
export class ZohoPaymentLinksService {
    constructor(
        private readonly zohoPaymentsService: ZohoPaymentsService,
        private readonly configService: ConfigService,
    ) { }

    async createPaymentLink(data: {
        quotationId: string;
        farmerName: string;
        farmerPhone: string;
        amount: number;
        description?: string;
    }) {
        const accessToken =
            await this.zohoPaymentsService.getValidAccessToken();

        // DEBUG: confirm the token being used matches your DB — remove once confirmed working
        console.log('[ZohoPaymentLinks] Using access token:', accessToken?.slice(0, 30) + '...');

        const accountId = this.configService.get<string>(
            'ZOHO_PAYMENTS_ACCOUNT_ID',
        );

        // FIX 1: use reference_id (not reference_number) per Zoho API spec
        // FIX 2: customer phone goes in top-level `phone` field (not nested `customer` object)
        // FIX 3: notify_customer is an object { email: boolean, sms: boolean }, not a boolean
        const payload = {
            amount: Number(data.amount),
            currency: 'INR',

            description:
                data.description ||
                `Quotation Payment for ${data.farmerName}`,

            reference_id: data.quotationId,

            phone: data.farmerPhone,

            phone_country_code: 'IN',

            expires_at: new Date(
                Date.now() + 72 * 60 * 60 * 1000,
            )
                .toISOString()
                .split('T')[0],

            notify_customer: {
                email: false,
                sms: false,
            },
        };

        try {
            // FIX 4: correct endpoint is /paymentlinks (no underscore), NOT /payment_links
            const response = await axios.post(
                `https://payments.zoho.in/api/v1/paymentlinks?account_id=${accountId}`,
                payload,
                {
                    headers: {
                        Authorization: `Zoho-oauthtoken ${accessToken}`,
                        'Content-Type': 'application/json',
                    },
                },
            );

            return response.data;
        } catch (error: unknown) {
            const err = error as AxiosError;

            console.error(
                'Zoho Payment Link Error:',
                JSON.stringify(err.response?.data, null, 2),
            );

            throw error;
        }
    }

    async getPaymentLink(paymentLinkId: string) {
        const accessToken =
            await this.zohoPaymentsService.getValidAccessToken();

        const accountId = this.configService.get<string>(
            'ZOHO_PAYMENTS_ACCOUNT_ID',
        );

        try {
            // This endpoint was already correct: /paymentlinks/{id}
            const response = await axios.get(
                `https://payments.zoho.in/api/v1/paymentlinks/${paymentLinkId}?account_id=${accountId}`,
                {
                    headers: {
                        Authorization: `Zoho-oauthtoken ${accessToken}`,
                    },
                },
            );

            return response.data;
        } catch (error: unknown) {
            const err = error as AxiosError;

            console.error(
                'Get Payment Link Error:',
                err.response?.data || err.message,
            );

            throw error;
        }
    }
}