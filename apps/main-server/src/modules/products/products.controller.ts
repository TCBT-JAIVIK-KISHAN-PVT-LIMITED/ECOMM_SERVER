import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
} from '@nestjs/common';

import { isValidObjectId } from 'mongoose';

import { ProductsService } from './products.service';
import { FilterProductsDto } from './dto/filter-products.dto';

@Controller('products')
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
  ) {}

  // ─────────────────────────────────────────
  // Get all active products
  // ─────────────────────────────────────────
  @Get()
  async getProducts() {
    return this.productsService.getActiveProducts();
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

    return this.productsService.getProductById(isMongoId ? id : String(id));
  }

  // ─────────────────────────────────────────
  // Filtered products (with validated DTO)
  // ─────────────────────────────────────────
  @Get('/filter')
  async getFilteredProducts(@Query() query: FilterProductsDto) {
    return this.productsService.getFilteredProducts(query);
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
  async searchProducts(@Query('q') q: string, @Query('limit') limit?: number) {
    if (!q?.trim()) {
      throw new BadRequestException('Search query is required');
    }

    return this.productsService.searchProducts(q, Number(limit) || 10);
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
