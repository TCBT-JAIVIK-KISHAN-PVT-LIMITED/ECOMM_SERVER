export const ZOHO_SCOPES = {
  crm: 'ZohoCRM.modules.ALL',
  inventory: 'ZohoInventory.fullaccess.all',
  payments:
    'ZohoPay.payments.CREATE,ZohoPay.payments.READ,ZohoPay.payments.UPDATE',
};

export const ZOHO_SERVICES = ['crm', 'inventory', 'payments'] as const;

export type ZohoService = (typeof ZOHO_SERVICES)[number];
