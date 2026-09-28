import { IsString } from 'class-validator';

export class AddToWishlistDto {
  @IsString()
  zoho_item_id!: string;
}
