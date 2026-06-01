import {
  Controller,
  Post,
  Body,
  UsePipes,
  ValidationPipe,
  UseGuards,
} from '@nestjs/common';
import { ShippingService } from './shipping.service';
import { CalculateRateDto } from './dto/calculate-rate.dto';
import { JwtAuthGuard } from '../../modules/auth/jwt-auth.guard';

@Controller('shipping')
export class ShippingController {
  constructor(private readonly shippingService: ShippingService) {}

  @UseGuards(JwtAuthGuard)
  @Post('rate')
  @UsePipes(new ValidationPipe({ transform: true }))
  async getRate(@Body() body: CalculateRateDto) {
    return this.shippingService.calculateRate(
      body.weight,
      body.deliveryPincode,
      body.type_of_package,
    );
  }
}
