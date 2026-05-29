import { IsNotEmpty, IsNumber, IsString, Min } from 'class-validator';

export class UpsertCartItemDto {
  @IsString()
  @IsNotEmpty()
  product_id: string;

  @IsNumber()
  @Min(0)
  quantity: number; // 0 => remove
}

