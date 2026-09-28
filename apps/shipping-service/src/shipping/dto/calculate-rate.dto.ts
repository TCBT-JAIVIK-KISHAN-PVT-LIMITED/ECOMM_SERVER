import { IsNumber, IsString, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CalculateRateDto {
  @Type(() => Number)
  @IsNumber()
  pickupPincode!: number;

  @Type(() => Number)
  @IsNumber()
  deliveryPincode!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  weight!: number; // in grams

  @IsString()
  packageType!: string; // 'SPS' | 'B2B'

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  orderAmount?: number;
}
