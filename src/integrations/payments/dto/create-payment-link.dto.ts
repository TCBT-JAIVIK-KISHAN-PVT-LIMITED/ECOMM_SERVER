import {
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreatePaymentLinkDto {
  @IsString()
  quotationId!: string;

  @IsString()
  farmerName!: string;

  @IsString()
  farmerPhone!: string;

  @IsNumber()
  amount!: number;

  @IsOptional()
  @IsString()
  description?: string;
}