export interface ShippingRateRequest {
  pickupPincode: number;
  deliveryPincode: number;
  weight: number; // in grams
  packageType: string; // 'SPS' | 'B2B'
  orderAmount?: number;
  dimensions?: {
    length: number;
    width: number;
    height: number;
    quantity: number;
  }[];
}

export interface ShippingRateResult {
  provider: string; // 'shipmozo' | 'bigship' | 'shipwala'
  courier: string; // e.g. 'Delhivery', 'DTDC'
  totalCharges: number;
  estimatedDelivery?: string;
  raw?: any; // raw provider response for debugging
}

export interface ShippingProvider {
  readonly name: string;
  calculateRate(request: ShippingRateRequest): Promise<ShippingRateResult[]>;
  isAvailable(): boolean;
}
