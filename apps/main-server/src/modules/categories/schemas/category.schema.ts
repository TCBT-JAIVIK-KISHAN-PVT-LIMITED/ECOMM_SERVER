import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type CategoryDocument = Category & Document;

@Schema({ timestamps: true })
export class Category {
  @Prop({ required: true, unique: true })
  category_id!: string;

  @Prop({ required: true })
  name!: string;

  @Prop({ default: true })
  is_active!: boolean;
}

export const CategorySchema = SchemaFactory.createForClass(Category);
