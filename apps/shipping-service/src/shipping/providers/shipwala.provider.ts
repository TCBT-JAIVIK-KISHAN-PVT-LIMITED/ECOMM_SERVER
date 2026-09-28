import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import {
  ShippingProvider,
  ShippingRateRequest,
  ShippingRateResult,
} from '../interfaces/shipping-provider.interface.js';

// ─── Shipwale API Interfaces ────────────────────────────────────────────────

export interface ShipwaleBox {
  length: number;
  breadth: number;
  height: number;
  weight: number;
  weight_unit: 'kg' | 'g';
  quantity: number;
}

export interface ShipwaleLogisticsRateRequest {
  origin_pin: string;
  destination_pin: string;
  payment_mode: 'Pre-paid' | 'COD';
  shipment_type: 'B2C' | 'B2B';
  invoice_amount: number;
  cod_amount?: number;
  insurance?: boolean;
  boxes: ShipwaleBox[];
}

export interface ShipwaleRate {
  rank: number;
  courier_name: string;
  service_mode: string;
  weight_slab: string;
  total_shipping_charge: number;
  currency: string;
}

export interface ShipwaleB2COrderRequest {
  wid: number;
  payment_mode: 'Pre-paid' | 'COD';
  customer_name: string;
  customer_phone: string;
  customer_email?: string;
  shipping_address: string;
  shipping_city: string;
  shipping_state: string;
  shipping_postcode: string;
  same?: boolean;
  boxes: ShipwaleBox[];
  items: {
    product_name: string;
    product_quantity: number;
    selling_price: number;
  }[];
  cod_amount?: number;
  insurance?: boolean;
  auto_ship?: boolean;
  service_id?: number;
}

export interface ShipwaleB2BOrderRequest extends ShipwaleB2COrderRequest {
  invoice_number: string;
  invoice_date: string;
  invoice_amount: number;
  seller_gst: string;
  customer_gst?: string;
  ewaybill?: string;
}

export interface ShipwalePickupRequest {
  warehouse_id: number;
  pickup_date: string; // YYYY-MM-DD
  pickup_time: string; // HH:MM
  package_count: number;
  service_type: 'b2c' | 'b2b';
}

// ─── ShipwalaProvider ────────────────────────────────────────────────────────

/**
 * Shipwale Provider — Full integration with Shipwale Developer API (v1)
 * API Base: https://api.shipwale.com/api/v1
 *
 * Supports:
 *  - Auto-login (email + password) with JWT token caching
 *  - Static Bearer token (SHIPWALA_API_KEY) as fallback
 *  - Live logistics rate quotes (calculateRate)
 *  - Volumetric weight estimator
 *  - Pincode serviceability check (ODA zone detection)
 *  - B2C and B2B order creation
 *  - Order management (get / delete/cancel)
 *  - Live shipment tracking (quick status + full scan timeline)
 *  - Shipping label retrieval (Base64 PDF)
 *  - Pickup vehicle dispatch scheduling
 *
 * Required env vars (at least one auth method must be configured):
 *   SHIPWALA_BASE_URL       — defaults to https://api.shipwale.com
 *   SHIPWALA_EMAIL          — merchant email for auto-login
 *   SHIPWALA_PASSWORD       — merchant password for auto-login
 *   SHIPWALA_API_KEY        — static Bearer token (alternative to email+password)
 *   SHIPWALA_WID            — default warehouse ID for order creation (optional)
 *   SHIPWALA_EXPIRY_DAYS    — token expiry days for auto-login (default: 30)
 */
@Injectable()
export class ShipwalaProvider implements ShippingProvider {
  readonly name = 'shipwala';
  private readonly logger = new Logger(ShipwalaProvider.name);

  private axiosInstance: AxiosInstance;

  // In-memory token cache
  private cachedToken: string | null = null;
  private tokenExpiresAt: Date | null = null;

  constructor(private configService: ConfigService) {
    const baseURL =
      this.configService.get<string>('SHIPWALA_BASE_URL') ||
      'https://api.shipwale.com';

    this.axiosInstance = axios.create({
      baseURL,
      timeout: 15000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  // ─── Availability Check ──────────────────────────────────────────────────

  isAvailable(): boolean {
    const staticKey = this.configService.get<string>('SHIPWALA_API_KEY');
    const email = this.configService.get<string>('SHIPWALA_EMAIL');
    const password = this.configService.get<string>('SHIPWALA_PASSWORD');
    // Available if either a static key is set OR email+password are both set
    return !!(staticKey || (email && password));
  }

  // ─── Authentication ───────────────────────────────────────────────────────

  /**
   * Returns a valid Bearer token.
   * Priority:
   *  1. Cached token (if not expired)
   *  2. Static SHIPWALA_API_KEY
   *  3. Auto-login via email + password
   */
  async getToken(): Promise<string> {
    const staticKey = this.configService.get<string>('SHIPWALA_API_KEY');

    // If a static key exists, use it directly
    if (staticKey) {
      return staticKey;
    }

    // Return cached token if still valid (with 5 min buffer)
    if (this.cachedToken && this.tokenExpiresAt) {
      const bufferMs = 5 * 60 * 1000;
      if (new Date().getTime() < this.tokenExpiresAt.getTime() - bufferMs) {
        return this.cachedToken;
      }
    }

    // Auto-login via email + password
    return this.login();
  }

  private async login(): Promise<string> {
    const email = this.configService.get<string>('SHIPWALA_EMAIL');
    const password = this.configService.get<string>('SHIPWALA_PASSWORD');
    const expiryDays =
      this.configService.get<number>('SHIPWALA_EXPIRY_DAYS') || 30;

    if (!email || !password) {
      throw new Error(
        'Shipwale credentials not configured. Set SHIPWALA_EMAIL + SHIPWALA_PASSWORD or SHIPWALA_API_KEY.',
      );
    }

    this.logger.log('Authenticating with Shipwale API...');

    const response = await this.axiosInstance.post('/api/v1/auth/login', {
      identifier: email,
      password,
      expiry_days: expiryDays,
    });

    const data = response.data;

    if (!data?.success || !data?.data?.access_token) {
      throw new Error(
        `Shipwale login failed: ${data?.message || JSON.stringify(data)}`,
      );
    }

    this.cachedToken = data.data.access_token;

    // Set expiry: token valid for expiryDays, stored with buffer
    const expiryMs = (data.data.expires_in_days || expiryDays) * 24 * 60 * 60 * 1000;
    this.tokenExpiresAt = new Date(Date.now() + expiryMs);

    this.logger.log(
      `Shipwale auth successful. Token expires: ${this.tokenExpiresAt.toISOString()}`,
    );

    return this.cachedToken!;
  }

  /** Verify the current token and return wallet balance */
  async verifyToken(): Promise<{ tokenStatus: string; walletBalance: number }> {
    const token = await this.getToken();
    const response = await this.axiosInstance.get('/api/v1/auth/verify', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const { data } = response.data;
    return {
      tokenStatus: data?.token_status || 'unknown',
      walletBalance: data?.merchant?.wallet_balance || 0,
    };
  }

  // ─── Shipping Rates ───────────────────────────────────────────────────────

  /**
   * Implements ShippingProvider.calculateRate
   * Converts internal ShippingRateRequest → Shipwale logistics rate request
   * Returns rates normalized to ShippingRateResult[]
   */
  async calculateRate(
    request: ShippingRateRequest,
  ): Promise<ShippingRateResult[]> {
    const token = await this.getToken();

    // Convert weight from grams to kg
    const weightKg = request.weight / 1000;

    const payload: ShipwaleLogisticsRateRequest = {
      origin_pin: String(request.pickupPincode),
      destination_pin: String(request.deliveryPincode),
      payment_mode: 'Pre-paid',
      shipment_type: request.packageType === 'B2B' ? 'B2B' : 'B2C',
      invoice_amount: request.orderAmount || 1000,
      cod_amount: 0,
      insurance: false,
      boxes: [
        {
          length: request.dimensions?.[0]?.length || 15,
          breadth: request.dimensions?.[0]?.width || 12,
          height: request.dimensions?.[0]?.height || 10,
          weight: weightKg,
          weight_unit: 'kg',
          quantity: request.dimensions?.[0]?.quantity || 1,
        },
      ],
    };

    this.logger.log(
      `Shipwale rate request: ${request.pickupPincode} → ${request.deliveryPincode}, weight=${weightKg}kg`,
    );

    const response = await this.axiosInstance.post(
      '/api/v1/pricing/logistics',
      payload,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    const data = response.data;

    if (!data?.success) {
      this.logger.warn(`Shipwale returned no success: ${data?.message}`);
      return [];
    }

    const availableRates: ShipwaleRate[] = data?.data?.available_rates || [];

    if (!availableRates.length) {
      this.logger.warn('Shipwale returned empty available_rates');
      return [];
    }

    return availableRates.map((rate) => ({
      provider: this.name,
      courier: rate.courier_name || 'Shipwale Courier',
      totalCharges: Number(rate.total_shipping_charge) || 0,
      estimatedDelivery: undefined, // Shipwale logistics API does not return TAT in this endpoint
      raw: rate,
    }));
  }

  // ─── Volumetric Weight Estimator ─────────────────────────────────────────

  /** Calculate volumetric weight offline without hitting external courier APIs */
  async calculateVolumetric(boxes: ShipwaleBox[]): Promise<any> {
    const token = await this.getToken();

    const response = await this.axiosInstance.post(
      '/api/v1/pricing/calculate',
      { boxes },
      { headers: { Authorization: `Bearer ${token}` } },
    );

    return response.data?.data || null;
  }

  // ─── Pincode Serviceability ───────────────────────────────────────────────

  /**
   * Check if a destination pincode is serviceable by Shipwale's carrier network.
   * Also detects ODA (Out-of-Delivery-Area) remote zones.
   */
  async checkPincode(pincode: string | number): Promise<{
    serviceable: boolean;
    isOdaZone: boolean;
    supportedPaymentMethods: string[];
    remarks: string;
    raw: any;
  }> {
    const token = await this.getToken();

    const response = await this.axiosInstance.get(
      `/api/v1/pincodes/check/${pincode}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    const data = response.data?.data;

    return {
      serviceable: data?.serviceable ?? false,
      isOdaZone: data?.is_oda_zone ?? false,
      supportedPaymentMethods: data?.supported_payment_methods || [],
      remarks: data?.remarks || '',
      raw: data,
    };
  }

  // ─── Order Creation ───────────────────────────────────────────────────────

  /** Create a B2C single-parcel shipment order */
  async createB2COrder(orderData: ShipwaleB2COrderRequest): Promise<any> {
    const token = await this.getToken();

    this.logger.log(
      `Creating Shipwale B2C order for customer: ${orderData.customer_name} → ${orderData.shipping_postcode}`,
    );

    const response = await this.axiosInstance.post(
      '/api/v1/orders/b2c/create',
      orderData,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    return response.data;
  }

  /** Create a B2B heavy cargo shipment order */
  async createB2BOrder(orderData: ShipwaleB2BOrderRequest): Promise<any> {
    const token = await this.getToken();

    this.logger.log(
      `Creating Shipwale B2B order for: ${orderData.customer_name} → ${orderData.shipping_postcode}`,
    );

    const response = await this.axiosInstance.post(
      '/api/v1/orders/b2b/create',
      orderData,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    return response.data;
  }

  // ─── Order Management ─────────────────────────────────────────────────────

  /** Retrieve full shipment details for a Shipwale order ID */
  async getOrderDetails(orderId: string): Promise<any> {
    const token = await this.getToken();

    const response = await this.axiosInstance.get(
      `/api/v1/orders/${orderId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    return response.data?.data || null;
  }

  /**
   * Delete or cancel an order.
   * - Unmanifested (pending) orders are permanently deleted from the database.
   * - Manifested orders trigger a carrier cancellation and wallet refund.
   */
  async cancelOrder(orderId: string): Promise<any> {
    const token = await this.getToken();

    this.logger.log(`Cancelling/deleting Shipwale order: ${orderId}`);

    const response = await this.axiosInstance.delete(
      `/api/v1/orders/${orderId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    return response.data;
  }

  // ─── Live Tracking ────────────────────────────────────────────────────────

  /**
   * Query real-time shipment tracking.
   * @param identifier — Shipwale Order ID (SWXD...), carrier AWB, or store reference number
   * @param comprehensive — If true, returns full scan history; otherwise returns quick status only
   */
  async getTracking(
    identifier: string,
    comprehensive = false,
  ): Promise<any> {
    const token = await this.getToken();
    const endpoint = comprehensive
      ? `/api/v1/tracking/${identifier}/details`
      : `/api/v1/tracking/${identifier}/status`;

    const response = await this.axiosInstance.get(endpoint, {
      headers: { Authorization: `Bearer ${token}` },
    });

    return response.data?.data || null;
  }

  // ─── Shipping Label ───────────────────────────────────────────────────────

  /**
   * Retrieve the shipping label (PDF as Base64) for a manifested shipment.
   * @param orderIdOrAwb — Shipwale Order ID or carrier AWB
   */
  async getShippingLabel(orderIdOrAwb: string): Promise<{
    labelBase64: string;
    downloadUrl: string;
    awb: string;
    carrierName: string;
  } | null> {
    const token = await this.getToken();

    const response = await this.axiosInstance.get(
      `/api/v1/orders/${orderIdOrAwb}/label`,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    const data = response.data?.data;
    if (!data) return null;

    return {
      labelBase64: data.label_pdf_base64 || '',
      downloadUrl: data.label_download_url || '',
      awb: data.awb || '',
      carrierName: data.carrier_name || '',
    };
  }

  // ─── Pickup Request ───────────────────────────────────────────────────────

  /**
   * Schedule a carrier pickup vehicle at your warehouse.
   * @param pickupData — Warehouse ID, date (YYYY-MM-DD), time (HH:MM), package count, service type
   */
  async schedulePickup(pickupData: ShipwalePickupRequest): Promise<any> {
    const token = await this.getToken();

    this.logger.log(
      `Scheduling Shipwale pickup at warehouse ${pickupData.warehouse_id} on ${pickupData.pickup_date} ${pickupData.pickup_time}`,
    );

    const response = await this.axiosInstance.post(
      '/api/v1/pickups/schedule',
      pickupData,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    return response.data;
  }
}
