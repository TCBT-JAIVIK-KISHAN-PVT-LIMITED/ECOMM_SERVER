import { IsNumber, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CalculateRateDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0.1)
  weight!: number;

  @IsString()
  type_of_package!: string;

  @Type(() => Number)
  @IsNumber()
  deliveryPincode!: number;
}
