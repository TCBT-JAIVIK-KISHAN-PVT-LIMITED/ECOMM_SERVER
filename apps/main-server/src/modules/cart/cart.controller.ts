import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedRequestUser } from '../auth/jwt.strategy';
import { GuestCartDto } from './dto/guest-cart.dto';
import { UpsertCartItemDto } from './dto/upsert-cart-item.dto';
import { CartService } from './cart.service';

@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Post('guest')
  createGuestCart() {
    const guestId = `guest_${Date.now()}`;
    return {
      guest_session_id: guestId,
    };
  }

  @Get('guest/:guestId')
  getGuestCart(@Param('guestId') guestId: string) {
    return this.cartService.getCartSummaryByGuest(guestId);
  }

  @Patch('guest/items')
  upsertGuestItem(@Body() body: GuestCartDto & UpsertCartItemDto) {
    if (!body.guest_session_id) {
      throw new Error('guest_session_id required');
    }

    return this.cartService.upsertItemForGuest(
      body.guest_session_id,
      body.product_id,
      body.quantity,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  getMyCart(@CurrentUser() user: AuthenticatedRequestUser) {
    return this.cartService.getCartSummaryByUser(user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('items')
  upsertMyItem(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Body() body: UpsertCartItemDto,
  ) {
    return this.cartService.upsertItemForUser(
      user.userId,
      body.product_id,
      body.quantity,
    );
  }
}
