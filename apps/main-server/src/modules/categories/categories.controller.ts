import { Controller, Get } from '@nestjs/common';
import { CategoryService } from './categories.service';

@Controller('categories')
export class CategoryController {
  constructor(private categoryService: CategoryService) {}

  // 🔥 SYNC API
  @Get('sync')
  async syncCategories() {
    return this.categoryService.syncCategories();
  }

  // 🔥 GET ALL
  @Get()
  async getAllCategories() {
    return this.categoryService.getAllCategories();
  }
}
