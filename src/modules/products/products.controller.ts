import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';

import { isValidObjectId } from 'mongoose';

import { ProductsService } from './products.service';
import { ProductSyncService } from './product-sync.service';

@Controller('products')
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly productSyncService: ProductSyncService,
  ) {}

  // ─────────────────────────────────────────
  // Get all active products
  // ─────────────────────────────────────────
  @Get()
  async getProducts() {
    return this.productsService.getActiveProducts();
  }

  // ─────────────────────────────────────────
  // Manual full sync trigger
  // ─────────────────────────────────────────
  @Post('sync-all-now')
  async syncAllNow() {
    await this.productSyncService.syncAllProducts();

    return {
      success: true,
      message: 'Full product sync completed',
    };
  }

  // ─────────────────────────────────────────
  // Sync single product by Zoho item ID
  // Useful for testing webhooks manually
  // ─────────────────────────────────────────
  @Post('sync/:zohoItemId')
  async syncSingleProduct(
    @Param('zohoItemId') zohoItemId: string,
  ) {
    await this.productSyncService.syncSingleItem(
      zohoItemId,
    );

    return {
      success: true,
      message: `Product ${zohoItemId} synced`,
    };
  }

  // ─────────────────────────────────────────
  // Get single product
  // Supports:
  // - Mongo _id
  // - zoho_item_id
  // ─────────────────────────────────────────
  @Get('/id/:id')
  async getProduct(@Param('id') id: string) {
    // allow Mongo ObjectId OR Zoho item/group ID
    const isMongoId = isValidObjectId(id);

    return this.productsService.getProductById(
      isMongoId ? id : String(id),
    );
  }

  // ─────────────────────────────────────────
  // Filtered products
  // ─────────────────────────────────────────
  @Get('/filter')
  async getFilteredProducts(
    @Query() query: any,
  ) {
    return this.productsService.getFilteredProducts(
      query,
    );
  }

  // ─────────────────────────────────────────
  // Categories
  // ─────────────────────────────────────────
  @Get('/categories/all')
  async getCategories() {
    return this.productsService.getCategories();
  }

  // ─────────────────────────────────────────
  // Search products
  // ─────────────────────────────────────────
  @Get('/search')
  async searchProducts(
    @Query('q') q: string,
    @Query('limit') limit?: number,
  ) {
    if (!q?.trim()) {
      throw new BadRequestException(
        'Search query is required',
      );
    }

    return this.productsService.searchProducts(
      q,
      Number(limit) || 10,
    );
  }

  // ─────────────────────────────────────────
  // Products with variants only
  // ─────────────────────────────────────────
  @Get('/variants')
  async getVariantProducts(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.productsService.getVariantProducts(
      Number(page) || 1,
      Number(limit) || 20,
    );
  }

  // ─────────────────────────────────────────
  // Price range
  // ─────────────────────────────────────────
  @Get('/price-range')
  async getPriceRange() {
    return this.productsService.getPriceRange();
  }
}