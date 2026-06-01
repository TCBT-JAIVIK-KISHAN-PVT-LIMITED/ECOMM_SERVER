import { Body, Controller, Get, Post, UseGuards, Headers, UnauthorizedException } from '@nestjs/common';
import { CouponService } from './coupon.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('coupon')
export class CouponController {
  constructor(private couponService: CouponService) {}

  /**
   * Validates the admin API key from request headers.
   * Only admins should be able to create coupons.
   */
  private validateAdminKey(key: string | undefined) {
    const expected = process.env.ADMIN_API_KEY;
    if (!expected || !key || key !== expected) {
      throw new UnauthorizedException('Unauthorized');
    }
  }

  @Post()
  create(
    @Body() body: any,
    @Headers('x-admin-key') adminKey: string,
  ) {
    this.validateAdminKey(adminKey);
    return this.couponService.createCoupon(body);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  getAll() {
    return this.couponService.getAvailableCoupons();
  }

  @UseGuards(JwtAuthGuard)
  @Post('validate')
  validate(@Body('code') code: string) {
    return this.couponService.validateCoupon(code);
  }
}
