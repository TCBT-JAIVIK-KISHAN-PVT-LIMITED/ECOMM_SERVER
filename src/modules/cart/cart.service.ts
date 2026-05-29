import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Product } from '../products/schemas/product.schema';
import { Cart } from './schemas/cart.schema';

@Injectable()
export class CartService {
  constructor(
    @InjectModel(Cart.name) private cartModel: Model<Cart>,
    @InjectModel(Product.name) private productModel: Model<Product>,
  ) { }

  async getOrCreateForGuest(guestSessionId: string) {
    if (!guestSessionId) {
      throw new BadRequestException('guest_session_id required');
    }

    return (
      (await this.cartModel.findOne({ guest_session_id: guestSessionId })) ??
      (await this.cartModel.create({
        guest_session_id: guestSessionId,
        items: [],
      }))
    );
  }

  async getOrCreateForUser(userId: string) {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid user ID');
    }

    const uid = new Types.ObjectId(userId);

    return (
      (await this.cartModel.findOne({ user_id: uid })) ??
      (await this.cartModel.create({ user_id: uid, items: [] }))
    );
  }

  async upsertItemForGuest(
    guestSessionId: string,
    productId: string,
    quantity: number,
  ) {
    const cart = await this.getOrCreateForGuest(guestSessionId);
    return this.upsertItem(cart, productId, quantity);
  }

  async upsertItemForUser(
    userId: string,
    productId: string,
    quantity: number,
  ) {
    const cart = await this.getOrCreateForUser(userId);
    return this.upsertItem(cart, productId, quantity);
  }

  private async upsertItem(cart: Cart, productId: string, quantity: number) {

    if (!Number.isInteger(quantity) || quantity < 0) {
      throw new BadRequestException('Invalid quantity');
    }

    // Resolve product — supports Mongo _id, zoho_item_id, or variant zoho_item_id
    const { product, variantId } = await this.resolveProduct(productId);

    if (!product || !product.is_active) {
      throw new BadRequestException('Invalid product');
    }

    // For variant items, check variant-level stock; for standalone, check product stock
    let availableStock = product.stock ?? 0;
    if (variantId && product.variants?.length) {
      const variant = product.variants.find(
        (v: any) => v.zoho_item_id === variantId,
      );
      if (variant) {
        availableStock = variant.stock ?? 0;
      }
    }

    if (availableStock <= 0) {
      throw new BadRequestException('Out of stock');
    }

    if (quantity > availableStock) {
      throw new BadRequestException('Insufficient stock');
    }

    // Use the productId string directly as the cart key (works for both _id and zoho_item_id)
    const cartKey = productId;

    // Deduplicate: merge any duplicate entries for the same product_id
    // (can happen after ObjectId→String schema migration)
    const deduped = new Map<string, number>();
    for (const item of cart.items) {
      const key = item.product_id.toString();
      deduped.set(key, (deduped.get(key) ?? 0) + item.quantity);
    }
    if (deduped.size < cart.items.length) {
      cart.items = Array.from(deduped.entries()).map(
        ([pid, qty]) => ({ product_id: pid, quantity: qty }) as any,
      );
    }

    const idx = cart.items.findIndex(
      (i) => i.product_id.toString() === cartKey,
    );

    if (quantity === 0) {
      if (idx >= 0) cart.items.splice(idx, 1);
    } else if (idx >= 0) {
      cart.items[idx].quantity = quantity;
    } else {
      cart.items.push({
        product_id: cartKey,
        quantity,
      } as any);
    }

    await cart.save();
    return this.getCartSummary(cart);
  }

  /**
   * Resolve a product by Mongo _id, zoho_item_id, or variant zoho_item_id.
   * Returns the parent product and optionally the matched variant's zoho_item_id.
   */
  private async resolveProduct(
    productId: string,
  ): Promise<{ product: any; variantId: string | null }> {
    const isMongoId = Types.ObjectId.isValid(productId)
      && String(new Types.ObjectId(productId)) === productId;

    if (isMongoId) {
      const product = await this.productModel.findById(productId).lean();
      return { product, variantId: null };
    }

    // Try zoho_item_id (standalone product)
    let product = await this.productModel
      .findOne({ zoho_item_id: productId })
      .lean();
    if (product) {
      return { product, variantId: null };
    }

    // Try as a variant's zoho_item_id
    product = await this.productModel
      .findOne({ 'variants.zoho_item_id': productId })
      .lean();
    if (product) {
      return { product, variantId: productId };
    }

    return { product: null, variantId: null };
  }

  async getCartSummaryByGuest(guestSessionId: string) {
    const cart = await this.getOrCreateForGuest(guestSessionId);
    return this.getCartSummary(cart);
  }

  async getCartSummaryByUser(userId: string) {
    const cart = await this.getOrCreateForUser(userId);
    return this.getCartSummary(cart);
  }

  async getCartSummary(cart: Cart) {
    const items = cart.items ?? [];

    if (!items.length) {
      return { cart_id: cart._id, items: [], total_amount: 0, totalWeight: 0 };
    }

    // Separate Mongo ObjectIds from Zoho IDs
    const mongoIds: Types.ObjectId[] = [];
    const zohoIds: string[] = [];

    for (const item of items) {
      const id = item.product_id.toString();
      const isMongoId = Types.ObjectId.isValid(id)
        && String(new Types.ObjectId(id)) === id;
      if (isMongoId) {
        mongoIds.push(new Types.ObjectId(id));
      } else {
        zohoIds.push(id);
      }
    }

    // Fetch products by both _id and zoho/variant zoho_item_id
    const products = await this.productModel
      .find({
        $or: [
          ...(mongoIds.length ? [{ _id: { $in: mongoIds } }] : []),
          ...(zohoIds.length
            ? [
                { zoho_item_id: { $in: zohoIds } },
                { 'variants.zoho_item_id': { $in: zohoIds } },
              ]
            : []),
        ],
        is_active: true,
      })
      .select(
        'name price stock image weight weight_unit variants zoho_item_id is_active',
      )
      .lean();

    // Build a lookup map: cart key → { product, variant? }
    const lookupMap = new Map<
      string,
      { product: any; variant: any | null }
    >();

    for (const p of products) {
      // Map by _id
      lookupMap.set(p._id.toString(), { product: p, variant: null });
      // Map by zoho_item_id
      if (p.zoho_item_id) {
        lookupMap.set(p.zoho_item_id, { product: p, variant: null });
      }
      // Map each variant's zoho_item_id
      for (const v of p.variants ?? []) {
        if (v.zoho_item_id) {
          lookupMap.set(v.zoho_item_id, { product: p, variant: v });
        }
      }
    }

    const detailed = items.map((i) => {
      const cartKey = i.product_id.toString();
      const entry = lookupMap.get(cartKey);
      const p = entry?.product;
      const v = entry?.variant;

      // Use variant data if available, otherwise parent product
      const price = v?.price ?? p?.price ?? 0;
      const name = v
        ? this.getVariantDisplayName(p, v)
        : p?.name;
      const imageUrl = v?.image?.image_url ?? p?.image?.image_url ?? null;

      let weight = 0;
      const rawWeight = v?.weight ?? p?.weight;
      const weightUnit = v?.weight_unit ?? p?.weight_unit;
      if (rawWeight) {
        weight = weightUnit === 'kg' ? rawWeight * 1000 : rawWeight;
      }

      // Fallback: parse weight from product/variant name (e.g. "100ml", "500g", "1kg")
      if (weight === 0) {
        weight = this.parseWeightFromName(name || '') || 100; // minimum 100g fallback
      }

      return {
        product_id: i.product_id,
        quantity: i.quantity,
        name,
        price,
        line_total: price * i.quantity,
        image_url: imageUrl,
        weight,
        total_weight: weight * i.quantity,
      };
    });

    const totalWeight = detailed.reduce(
      (sum, item) => sum + item.total_weight,
      0,
    );

    const total_amount = detailed.reduce(
      (sum, it) => sum + (it.line_total ?? 0),
      0,
    );

    return {
      cart_id: cart._id,
      items: detailed,
      totalWeight,
      total_amount,
    };
  }

  /**
   * Build a clean display name for a variant.
   * E.g. "NEEMDHARA" + attributes { Weight: "500ml" } → "NEEMDHARA — 500ml"
   */
  private getVariantDisplayName(product: any, variant: any): string {
    const baseName = product?.name || 'Product';
    const attrs = variant?.attributes;
    if (attrs && typeof attrs === 'object') {
      const values = Object.values(attrs).filter(
        (v) => typeof v === 'string' && (v as string).trim(),
      );
      if (values.length) {
        return `${baseName} — ${values.join(', ')}`;
      }
    }
    return variant?.name || baseName;
  }

  /**
   * Parse weight from a product/variant name string.
   * Handles: "100ml", "500g", "250gm", "1kg", "1.5 kg", "1l"
   * Returns weight in grams, or 0 if no recognisable pattern.
   */
  private parseWeightFromName(name: string): number {
    if (!name) return 0;
    const str = name.toLowerCase();

    // Match number followed by unit anywhere in the string
    const match = str.match(/([\d.]+)\s*(kg|g|gm|ml|l)\b/);
    if (!match) return 0;

    const value = parseFloat(match[1]);
    const suffix = match[2];

    switch (suffix) {
      case 'kg':
      case 'l':
        return value * 1000;
      case 'g':
      case 'gm':
      case 'ml':
        return value;
      default:
        return 0;
    }
  }

  async mergeGuestIntoUser(guestSessionId: string, userId: string) {
    const guestCart = await this.cartModel.findOne({
      guest_session_id: guestSessionId,
    });


    if (!guestCart || !guestCart.items?.length) return;

    const userCart = await this.getOrCreateForUser(userId);

    const qtyByProduct = new Map<string, number>();

    for (const it of userCart.items ?? []) {
      qtyByProduct.set(it.product_id.toString(), it.quantity);
    }

    for (const it of guestCart.items ?? []) {
      const key = it.product_id.toString();
      qtyByProduct.set(key, (qtyByProduct.get(key) ?? 0) + it.quantity);
    }

    userCart.items = Array.from(qtyByProduct.entries()).map(
      ([pid, quantity]) => ({
        product_id: pid,
        quantity,
      }),
    ) as any;

    await userCart.save();

    await this.cartModel.deleteOne({ _id: guestCart._id });
  }
}