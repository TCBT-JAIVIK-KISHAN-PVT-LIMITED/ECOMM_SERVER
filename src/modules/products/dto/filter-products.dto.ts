import { IsOptional, IsString, IsNumber, IsBoolean, Min, Max, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * Validated DTO for the GET /products/filter endpoint.
 * Prevents NoSQL injection by whitelisting and typing all query params.
 */
export class FilterProductsDto {
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(1)
  page?: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(1)
  @Max(50)
  limit?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0)
  minPrice?: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0)
  maxPrice?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  hasVariants?: boolean;
}
