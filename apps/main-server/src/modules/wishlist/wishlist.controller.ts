import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import { WishlistService } from './wishlist.service';
import { AddToWishlistDto } from './dto/add-to-wishlist.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('wishlist')
export class WishlistController {
  constructor(private wishlistService: WishlistService) {}

  // ✅ Get wishlist
  @Get()
  get(@Req() req: any) {
    return this.wishlistService.getWishlist(req.user.userId);
  }

  // ✅ Add item
  @Post()
  add(@Req() req: any, @Body() dto: AddToWishlistDto) {
    return this.wishlistService.addToWishlist(
      req.user.userId,
      dto.zoho_item_id,
    );
  }

  // ✅ Remove item
  @Delete(':zoho_item_id')
  remove(@Req() req: any, @Param('zoho_item_id') zoho_item_id: string) {
    return this.wishlistService.removeFromWishlist(
      req.user.userId,
      zoho_item_id,
    );
  }
}
