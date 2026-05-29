import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Product } from './schemas/product.schema';
export interface ProductFilterQuery {
  page?: number;
  limit?: number;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  search?: string;
  hasVariants?: boolean;
}

type ProductMongoFilter = {
  is_active: boolean;
  $or?: Array<Record<string, unknown>>;
  price?: {
    $gte?: number;
    $lte?: number;
  };
  has_variants?: boolean;
};

/**
 * ProductsService — frontend / consumer-facing queries ONLY.
 *
 * No cron jobs. No sync logic. No Zoho API calls.
 * Single responsibility: serve product data from MongoDB.
 */
@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    @InjectModel(Product.name)
    private readonly productModel: Model<Product>,
  ) { }

  // ─────────────────────────────────────────
  // Get all active products (lightweight list)
  // ─────────────────────────────────────────
  async getActiveProducts() {
    const products = await this.productModel
      .find({ is_active: true })
      .select(
        'name price label_rate stock description image category_name ' +
        'has_variants variant_attribute_names variants brand sku',
      )
      .lean();

    return {
      data: products,
      total: products.length,
    };
  }

  // ─────────────────────────────────────────
  // Get single product by MongoDB _id or zoho_item_id
  // ─────────────────────────────────────────
  async getProductById(id: string) {
    // Build $or conditions — only include _id if it's a valid ObjectId
    // to avoid Mongoose CastError when id is a zoho_item_id string
    const { Types } = await import('mongoose');
    const orConditions: Record<string, any>[] = [{ zoho_item_id: id }];
    if (Types.ObjectId.isValid(id) && String(new Types.ObjectId(id)) === id) {
      orConditions.unshift({ _id: id });
    }

    const product = await this.productModel
      .findOne({
        $or: orConditions,
        is_active: true,
      })
      .lean();

    if (!product) throw new NotFoundException('Product not found');

    // If product has no description, try to find one from a related product
    // (same base name or same group_id)
    if (!product.description && product.name) {
      // Extract base name (e.g. "NEEM BAAN" from "NEEM BAAN (100ml-250ml-500ml)")
      const baseName = product.name.replace(/\s*\(.*\)\s*$/, '').trim();
      const related = await this.productModel
        .findOne({
          is_active: true,
          description: { $ne: '', $exists: true },
          name: { $regex: `^${baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, $options: 'i' },
        })
        .select('description')
        .lean();

      if (related?.description) {
        (product as any).description = related.description;
      }
    }

    return product;
  }

  // ─────────────────────────────────────────
  // Filtered + paginated product list
  // ─────────────────────────────────────────
  async getFilteredProducts(query: ProductFilterQuery) {
    const {
      page = 1,
      limit = 20,
      category,
      minPrice,
      maxPrice,
      search,
      hasVariants,
    } = query;

    const safePage = Math.max(1, Number(page));
    const safeLimit = Math.min(Math.max(1, Number(limit)), 50);

const filter: ProductMongoFilter = {
  is_active: true,
};

    if (category) {
      filter.$or = [
        { category_id: category },
        { category_name: { $regex: category, $options: 'i' } },
      ];
    }

    if (minPrice !== undefined || maxPrice !== undefined) {
      filter.price = {};
      if (minPrice !== undefined) filter.price.$gte = Number(minPrice);
      if (maxPrice !== undefined) filter.price.$lte = Number(maxPrice);
    }

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        {
          description: {
            $regex: search,
            $options: 'i',
          },
        },
      ];
    }

    if (hasVariants !== undefined) {
      filter.has_variants = hasVariants;
    }

    const skip = (safePage - 1) * safeLimit;

    const [products, total] = await Promise.all([
      this.productModel
        .find(filter)
        .skip(skip)
        .limit(safeLimit)
        .select(
          'name price label_rate stock image category_name has_variants ' +
          'variant_attribute_names variants brand sku description weight weight_unit',
        )
        .lean(),
      this.productModel.countDocuments(filter),
    ]);

    return {
      data: products,
      total,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.ceil(total / safeLimit),
    };
  }

  // ─────────────────────────────────────────
  // Get all distinct categories
  // ─────────────────────────────────────────
  async getCategories() {
    const categories = await this.productModel
      .aggregate([
        { $match: { is_active: true, category_name: { $ne: '' } } },
        {
          $group: {
            _id: '$category_id',
            name: { $first: '$category_name' },
            count: { $sum: 1 },
          },
        },
        { $sort: { name: 1 } },
      ])
      .exec();

    return categories.map((c) => ({
      id: c._id,
      name: c.name,
      productCount: c.count,
    }));
  }

  // ─────────────────────────────────────────
  // Get products in a specific category
  // ─────────────────────────────────────────
  async getProductsByCategory(categoryId: string, page = 1, limit = 20) {
    return this.getFilteredProducts({ category: categoryId, page, limit });
  }

  // ─────────────────────────────────────────
  // Search products by name / description
  // ─────────────────────────────────────────
  async searchProducts(searchTerm: string, limit = 10) {
    const products = await this.productModel
      .find({
        is_active: true,
        name: { $regex: searchTerm, $options: 'i' },
      })
      .limit(limit)
      .select('name price image category_name has_variants sku')
      .lean();

    return products;
  }

  // ─────────────────────────────────────────
  // Get products with variants only
  // ─────────────────────────────────────────
  async getVariantProducts(page = 1, limit = 20) {
    return this.getFilteredProducts({ hasVariants: true, page, limit });
  }

  // ─────────────────────────────────────────
  // Get price range for active products
  // ─────────────────────────────────────────
  async getPriceRange(): Promise<{ min: number; max: number }> {
    const result = await this.productModel
      .aggregate([
        { $match: { is_active: true } },
        {
          $group: {
            _id: null,
            min: { $min: '$price' },
            max: { $max: '$price' },
          },
        },
      ])
      .exec();

    return result[0] ?? { min: 0, max: 0 };
  }
}
