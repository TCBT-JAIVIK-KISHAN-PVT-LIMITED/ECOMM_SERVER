import { Injectable } from '@nestjs/common';
import { ZohoHttpService } from '../core/zoho-http.service';
import { ConfigService } from '@nestjs/config';
import { ZohoAuthService } from '../core/zoho-auth.service';

type ZohoAddressPayload = {
  attention?: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone?: string;
};

@Injectable()
export class ZohoInventoryService {
  constructor(
    private readonly http: ZohoHttpService,
    private readonly config: ConfigService,
    private readonly zohoAuthService: ZohoAuthService,
  ) {}

  private getOrgId(): string {
    return this.config.getOrThrow<string>('ZOHO_ORG_ID');
  }

  private buildZohoAddress(order: any): ZohoAddressPayload {
    const address = order.address ?? {};
    const line1 = address.addressLine ?? address.line1 ?? address.address;
    const phone =
      order.customerMobile ?? address.phone ?? address.receiver_phone;

    if (!line1 || !address.city || !address.state || !address.pincode) {
      throw new Error('Order address is incomplete for Zoho sync');
    }

    const zohoAddress: ZohoAddressPayload = {
      attention: order.customerName || address.name || undefined,
      address: line1,
      city: address.city,
      state: address.state,
      zip: address.pincode,
    };

    if (phone) {
      zohoAddress.phone = phone;
    }

    return zohoAddress;
  }

  private addressMatchesZoho(
    address: any,
    expected: ZohoAddressPayload,
  ): boolean {
    return (
      String(address?.address ?? '').trim() === expected.address.trim() &&
      String(address?.city ?? '').trim() === expected.city.trim() &&
      String(address?.state ?? '').trim() === expected.state.trim() &&
      String(address?.zip ?? '').trim() === expected.zip.trim()
    );
  }

  private async upsertContactAddresses(
    customerId: string,
    order: any,
  ): Promise<{
    billingAddressId: string;
    shippingAddressId: string;
  }> {
    const orgId = this.getOrgId();
    const address = this.buildZohoAddress(order);
    const contactName =
      order.customerName || address.attention || 'App Customer';

    const updateRes = await this.http.request(
      'PUT',
      `https://www.zohoapis.in/inventory/v1/contacts/${customerId}` +
        `?organization_id=${orgId}`,
      'inventory',
      {
        contact_name: contactName,
        billing_address: address,
        shipping_address: address,
      },
    );

    const contact = updateRes?.contact ?? {};
    let billingAddressId =
      contact.billing_address?.address_id ?? contact.billing_address_id;
    let shippingAddressId =
      contact.shipping_address?.address_id ?? contact.shipping_address_id;

    if (!billingAddressId || !shippingAddressId) {
      const addressRes = await this.http.request(
        'GET',
        `https://www.zohoapis.in/inventory/v1/contacts/${customerId}/address` +
          `?organization_id=${orgId}`,
        'inventory',
      );

      const matchedAddress = (addressRes?.addresses ?? []).find((item: any) =>
        this.addressMatchesZoho(item, address),
      );

      billingAddressId = billingAddressId ?? matchedAddress?.address_id;
      shippingAddressId = shippingAddressId ?? matchedAddress?.address_id;
    }

    if (!billingAddressId || !shippingAddressId) {
      throw new Error('Failed to resolve Zoho contact address IDs');
    }

    return {
      billingAddressId: String(billingAddressId),
      shippingAddressId: String(shippingAddressId),
    };
  }

  async getItems(
    page = 1,
    perPage = 200,
  ): Promise<{
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

  async getItemImageMeta(itemId: string): Promise<{
    imageUrl: string;
    zohoToken: string;
  } | null> {
    const imageUrl =
      `https://www.zohoapis.in/inventory/v1/items/${itemId}/image` +
      `?organization_id=${this.getOrgId()}`;

    try {
      // lightweight stream probe
      const stream = await this.http.request(
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
      const status = err?.response?.status;

      if (status === 400 || status === 404) {
        return null;
      }

      throw err;
    }

    const zohoToken =
      await this.zohoAuthService.getValidAccessToken('inventory');

    return {
      imageUrl,
      zohoToken,
    };
  }

  async createSalesOrder(order: any, customerId: string): Promise<string> {
    const { billingAddressId, shippingAddressId } =
      await this.upsertContactAddresses(customerId, order);

    const payload = {
      customer_id: customerId,
      reference_number: order.orderId,
      salesperson_name: 'TCBT App',
      line_items: order.items.map((item: any) => ({
        item_id: item.zohoItemId,
        name: item.name,
        rate: item.price,
        quantity: item.quantity,
      })),
      shipping_charge: order.shippingCharge,
      billing_address_id: billingAddressId,
      shipping_address_id: shippingAddressId,
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

  /**
   * Create an invoice from an existing sales order.
   * Zoho will auto-populate line items from the SO.
   */
  async createInvoiceFromSalesOrder(
    salesorderId: string,
    customerId: string,
  ): Promise<{ invoiceId: string; invoiceNumber: string }> {
    const orgId = this.getOrgId();

    const response = await this.http.request(
      'POST',
      `https://www.zohoapis.in/inventory/v1/invoices/fromsalesorder` +
        `?organization_id=${orgId}&salesorder_id=${salesorderId}`,
      'inventory',
    );

    const invoice = response?.invoice;
    if (!invoice?.invoice_id) {
      throw new Error('Failed to create invoice — no invoice_id returned');
    }

    console.log(
      `[Zoho] Invoice created: ${invoice.invoice_number} (${invoice.invoice_id}) from SO ${salesorderId}`,
    );

    return {
      invoiceId: invoice.invoice_id,
      invoiceNumber: invoice.invoice_number,
    };
  }

  /**
   * Record a customer payment against an invoice to mark it as Paid.
   */
  async recordPaymentForInvoice(
    customerId: string,
    invoiceId: string,
    amount: number,
    paymentReference: string,
  ): Promise<string> {
    const orgId = this.getOrgId();

    const payload = {
      customer_id: customerId,
      payment_mode: 'Online Payment',
      amount,
      date: new Date().toISOString().split('T')[0], // YYYY-MM-DD
      reference_number: paymentReference,
      invoices: [
        {
          invoice_id: invoiceId,
          amount_applied: amount,
        },
      ],
    };

    const response = await this.http.request(
      'POST',
      `https://www.zohoapis.in/inventory/v1/customerpayments` +
        `?organization_id=${orgId}`,
      'inventory',
      payload,
    );

    const paymentId = response?.payment?.payment_id;
    console.log(
      `[Zoho] Payment recorded: ${paymentId} for invoice ${invoiceId} (₹${amount})`,
    );

    return paymentId;
  }

  /**
   * Full flow: Create Sales Order → Invoice → Record Payment.
   * Returns all IDs for tracking.
   */
  async createSalesOrderWithInvoice(
    order: any,
    customerId: string,
  ): Promise<{
    salesOrderId: string;
    invoiceId: string;
    invoiceNumber: string;
    paymentId: string;
  }> {
    // 1. Create Sales Order
    const salesOrderId = await this.createSalesOrder(order, customerId);
    console.log(`[Zoho] Step 1/3: Sales Order created: ${salesOrderId}`);

    // 2. Create Invoice from Sales Order
    const { invoiceId, invoiceNumber } = await this.createInvoiceFromSalesOrder(
      salesOrderId,
      customerId,
    );
    console.log(`[Zoho] Step 2/3: Invoice created: ${invoiceNumber}`);

    // 3. Record Payment to clear the invoice
    const paymentId = await this.recordPaymentForInvoice(
      customerId,
      invoiceId,
      order.finalAmount,
      order.orderId, // Use app order ID as payment reference
    );
    console.log(`[Zoho] Step 3/3: Payment recorded: ${paymentId}`);

    return { salesOrderId, invoiceId, invoiceNumber, paymentId };
  }

  /**
   * Create or find a contact in Zoho Inventory by phone number.
   * Returns the contact_id.
   */
  async createOrGetContact(user: {
    name?: string;
    mobile_number: string;
    email?: string;
  }): Promise<string> {
    const orgId = this.getOrgId();

    // 1. Search for existing contact by phone
    try {
      const searchRes = await this.http.request(
        'GET',
        `https://www.zohoapis.in/inventory/v1/contacts` +
          `?organization_id=${orgId}&phone=${encodeURIComponent(user.mobile_number)}`,
        'inventory',
      );

      const contacts = searchRes?.contacts ?? [];
      const match = contacts.find(
        (c: any) =>
          c.phone === user.mobile_number || c.mobile === user.mobile_number,
      );

      if (match?.contact_id) {
        console.log(
          `[Zoho] Found existing contact: ${match.contact_id} for ${user.mobile_number}`,
        );
        return match.contact_id;
      }
    } catch (err: any) {
      console.warn(
        `[Zoho] Contact search failed: ${err.message}, will create new`,
      );
    }

    // 2. Create new contact
    const contactName = user.name || 'App Customer';
    const payload: any = {
      contact_name: contactName,
      contact_type: 'customer',
      phone: user.mobile_number,
      mobile: user.mobile_number,
    };

    if (user.email) {
      payload.email = user.email;
    }

    const createRes = await this.http.request(
      'POST',
      `https://www.zohoapis.in/inventory/v1/contacts` +
        `?organization_id=${orgId}`,
      'inventory',
      payload,
    );

    const contactId = createRes?.contact?.contact_id;
    if (!contactId) {
      throw new Error(
        'Failed to create Zoho Inventory contact — no contact_id returned',
      );
    }

    console.log(
      `[Zoho] Created new contact: ${contactId} for ${user.mobile_number}`,
    );
    return contactId;
  }

  async updateContact(
    contactId: string,
    data: {
      name?: string;
      email?: string;
      phone?: string;
    },
  ): Promise<void> {
    const payload: any = {
      contact_name: data.name || 'App Customer',
    };

    if (data.email) {
      payload.email = data.email;
    }

    if (data.phone) {
      payload.phone = data.phone;
      payload.mobile = data.phone;
    }

    await this.http.request(
      'PUT',
      `https://www.zohoapis.in/inventory/v1/contacts/${contactId}` +
        `?organization_id=${this.getOrgId()}`,
      'inventory',
      payload,
    );
  }
}
