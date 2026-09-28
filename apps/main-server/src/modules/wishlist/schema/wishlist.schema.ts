import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type WishlistDocument = HydratedDocument<Wishlist>;

@Schema({ timestamps: true })
export class Wishlist {
  @Prop({ required: true, unique: true })
  userId!: string;

  @Prop([
    {
      zoho_item_id: { type: String, required: true },
    },
  ])
  items!: {
    zoho_item_id: string;
  }[];
}

export const WishlistSchema = SchemaFactory.createForClass(Wishlist);
