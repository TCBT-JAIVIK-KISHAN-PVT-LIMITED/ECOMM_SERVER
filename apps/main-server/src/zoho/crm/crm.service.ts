/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */

import { Injectable } from '@nestjs/common';
import { ZohoHttpService } from '../core/zoho-http.service';

@Injectable()
export class CrmService {
  constructor(private readonly http: ZohoHttpService) {}

  // 🔥 CREATE CONTACT
  async createContact(data: any) {
    const res = await this.http.request(
      'POST',
      'https://www.zohoapis.in/crm/v2/Contacts',
      'crm',
      { data: [data] },
    );

    return res?.data?.[0]?.details?.id;
  }

  // 🔥 UPDATE CONTACT
  async updateContact(contactId: string, data: any) {
    return this.http.request(
      'PUT',
      'https://www.zohoapis.in/crm/v2/Contacts',
      'crm',
      {
        data: [
          {
            id: contactId,
            ...data,
          },
        ],
      },
    );
  }

  // 🔥 UPSERT CONTACT (SAFE + CLEAN)
  async upsertContact(user: any) {
    const search = await this.http.request(
      'GET',
      `https://www.zohoapis.in/crm/v2/Contacts/search?criteria=(Phone:equals:${user.mobile_number})`,
      'crm',
    );

    console.log('Zoho search response:', search);

    // ✅ SAFE CHECK
    if (search?.data?.length) {
      return search.data[0].id;
    }

    // 🔥 CREATE IF NOT FOUND
    return this.createContact({
      First_Name: user.name || 'Guest',
      Last_Name: 'Customer',
      Phone: user.mobile_number,
      Email: user.email,
    });
  }
}
