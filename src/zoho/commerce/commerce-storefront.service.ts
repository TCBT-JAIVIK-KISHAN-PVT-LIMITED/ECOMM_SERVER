import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * 🛒 Zoho Commerce Storefront API Service
 *
 * Uses the PUBLIC (unauthenticated) Storefront API to fetch
 * ONLY the products visible on the published commerce store.
 *
 * Base URL (India): https://commerce.zoho.in/storefront/api/v1/
 * Required header: domain-name: <published storefront domain>
 */
@Injectable()
export class ZohoCommerceStorefrontService {
  private readonly logger = new Logger(ZohoCommerceStorefrontService.name);

  // India region base URL — no auth needed
  private readonly BASE_URL = 'https://commerce.zoho.in/storefront/api/v1';

  constructor(private config: ConfigService) {}

  /**
   * Returns the published storefront domain from env,
   * e.g. "products.tcbtjaivikkisan.com"
   */
  private getDomain(): string {
    return (
      this.config.get<string>('ZOHO_COMMERCE_STOREFRONT_DOMAIN') ||
      'products.tcbtjaivikkisan.com'
    );
  }

  /**
   * Generic storefront GET request — no OAuth needed,
   * just the domain-name header.
   */
  private async storefrontGet<T = any>(
    path: string,
    params: Record<string, string | number> = {},
  ): Promise<T> {
    const query = new URLSearchParams({ format: 'json', ...params } as any);
    const url = `${this.BASE_URL}${path}?${query}`;

    const res = await fetch(url, {
      method: 'GET',
      headers: { 'domain-name': this.getDomain() },
    });

    const text = await res.text();
    let data: any;

    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      this.logger.error(`Non-JSON storefront response: ${text.slice(0, 200)}`);
      throw new Error('Zoho Storefront returned invalid JSON');
    }

    if (!res.ok) {
      this.logger.error(`Storefront API ${res.status}: ${JSON.stringify(data)}`);
      throw new Error(data?.message || `Storefront API failed (${res.status})`);
    }

    return data;
  }

  // =============================================
  // 📦 PRODUCTS
  // =============================================

  /**
   * Fetch a single page of published products.
   */
  async getProducts(
    page = 1,
    perPage = 200,
  ): Promise<{
    products: any[];
    hasMore: boolean;
    page: number;
  }> {
    const data = await this.storefrontGet('/products', {
      page,
      per_page: perPage,
    });

    return {
      products: data?.payload?.products || [],
      hasMore: data?.page_context?.has_more_page ?? false,
      page: data?.page_context?.page ?? page,
    };
  }

  /**
   * 🔑 Fetch ALL published variant IDs across all pages.
   *
   * IMPORTANT: Zoho Commerce `product_id` does NOT match
   * Zoho Inventory `item_id`. The `variant_id` from the
   * Storefront API is what maps to the Inventory `item_id`
   * (stored in our DB as `zoho_item_id`).
   *
   * We collect BOTH product_id and variant_id to ensure
   * matching works regardless of which ID format is stored.
   */
  async getAllPublishedProductIds(): Promise<Set<string>> {
    const ids = new Set<string>();
    let page = 1;
    let hasMore = true;

    this.logger.log('🛒 Fetching all published product IDs from Storefront API...');

    while (hasMore) {
      const result = await this.getProducts(page, 200);

      for (const product of result.products) {
        // Add the product_id
        if (product.product_id) {
          ids.add(String(product.product_id));
        }

        // Add all variant_ids — these map to Zoho Inventory item_id
        if (product.variants && Array.isArray(product.variants)) {
          for (const variant of product.variants) {
            if (variant.variant_id) {
              ids.add(String(variant.variant_id));
            }
          }
        }
      }

      this.logger.log(`  📄 Page ${page}: ${result.products.length} products`);

      hasMore = result.hasMore;
      page++;
    }

    this.logger.log(`✅ Total published IDs (product + variant): ${ids.size}`);
    return ids;
  }

  /**
   * Fetch a single product's full storefront data.
   */
  async getProduct(productId: string): Promise<any> {
    const data = await this.storefrontGet(`/products/${productId}`);
    return data?.payload?.product || null;
  }

  // =============================================
  // 📂 CATEGORIES
  // =============================================

  /**
   * Fetch all categories from the storefront.
   */
  async getCategories(): Promise<any[]> {
    const data = await this.storefrontGet('/categories');
    return data?.payload?.categories || [];
  }

  /**
   * Fetch a single category with its products.
   */
  async getCategory(categoryId: string): Promise<any> {
    const data = await this.storefrontGet(`/categories/${categoryId}`);
    return data?.payload?.category || null;
  }
}
