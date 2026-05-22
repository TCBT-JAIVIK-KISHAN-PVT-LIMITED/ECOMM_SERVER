import { Injectable } from '@nestjs/common';
import { ZohoHttpService } from '../core/zoho-http.service';
import { ConfigService } from '@nestjs/config';
import { ZohoAuthService } from '../core/zoho-auth.service';

@Injectable()
export class ZohoInventoryService {
  constructor(
    private readonly http: ZohoHttpService,
    private readonly config: ConfigService,
    private readonly zohoAuthService: ZohoAuthService,
  ) { }

  private getOrgId(): string {
    return this.config.getOrThrow<string>('ZOHO_ORG_ID');
  }

  async getItems(page = 1, perPage = 200): Promise<{
    items: any[];
    has_more_page: boolean;
  }> {
    const response = await this.http.request(
      'GET',
      `https://www.zohoapis.in/inventory/v1/items` +
      `?organization_id=${this.getOrgId()}&page=${page}&per_page=${perPage}`,
      'inventory',
    );
    return {
      items: response?.items ?? [],
      has_more_page: response?.page_context?.has_more_page ?? false,
    };
  }

  async getAllItems(): Promise<any[]> {
    const all: any[] = [];
    let page = 1;

    while (true) {
      const { items, has_more_page } = await this.getItems(page, 200);
      all.push(...items);
      if (!has_more_page) break;
      page++;
    }

    return all;
  }

  async getItem(itemId: string): Promise<any | null> {
    const response = await this.http.request(
      'GET',
      `https://www.zohoapis.in/inventory/v1/items/${itemId}` +
      `?organization_id=${this.getOrgId()}`,
      'inventory',
    );
    return response?.item ?? null;
  }

  async getItemImageMeta(
    itemId: string,
  ): Promise<{
    imageUrl: string;
    zohoToken: string;
  } | null> {

    const imageUrl =
      `https://www.zohoapis.in/inventory/v1/items/${itemId}/image` +
      `?organization_id=${this.getOrgId()}`;

    try {

      // lightweight stream probe
      const stream =
        await this.http.request(
          'GET',
          imageUrl,
          'inventory',
          undefined,
          {
            responseType: 'stream',
          },
        );

      // destroy immediately
      stream?.cancel?.();

    } catch (err: any) {

      const status =
        err?.response?.status;

      if (
        status === 400 ||
        status === 404
      ) {
        return null;
      }

      throw err;
    }

    const zohoToken =
      await this.zohoAuthService
        .getValidAccessToken('inventory');

    return {
      imageUrl,
      zohoToken,
    };
  }

  async createSalesOrder(order: any, customerId: string): Promise<string> {
    const payload = {
      customer_id: customerId,
      reference_number: order.orderId,
      line_items: order.items.map((item: any) => ({
        item_id: item.zohoItemId,
        name: item.name,
        rate: item.price,
        quantity: item.quantity,
      })),
      shipping_charge: order.shippingCharge,
      billing_address: {
        address: order.address.addressLine,
        city: order.address.city,
        state: order.address.state,
        zip: order.address.pincode,
        phone: order.address.phone,
      },
      shipping_address: {
        address: order.address.addressLine,
        city: order.address.city,
        state: order.address.state,
        zip: order.address.pincode,
        phone: order.address.phone,
      },
    };

    const response = await this.http.request(
      'POST',
      `https://www.zohoapis.in/inventory/v1/salesorders` +
      `?organization_id=${this.getOrgId()}`,
      'inventory',
      payload,
    );

    return response.salesorder?.salesorder_id;
  }
}