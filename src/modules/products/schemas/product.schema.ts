import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ProductDocument = Product & Document;


@Schema({ _id: false })
class ProductImage {
  @Prop() image_url!: string;
  @Prop() image_s3_key!: string;
  @Prop() image_hash!: string;
  @Prop() image_name!: string;
  @Prop() image_last_synced_at!: Date;
}
const ProductImageSchema = SchemaFactory.createForClass(ProductImage);


@Schema({ _id: false })
class ProductVariant {

  @Prop({ required: true }) zoho_item_id!: string;
  @Prop() sku!: string;

  @Prop({ required: true }) name!: string;
  @Prop({ required: true }) price!: number;
  @Prop({ default: 0 }) stock!: number;

  @Prop({ type: Object, default: {} }) attributes!: Record<string, string>;

  @Prop() weight!: number;
  @Prop() weight_unit!: string;
  @Prop() dimensions_with_unit!: string;

  @Prop({ type: ProductImageSchema, default: null }) image!: ProductImage | null;


  @Prop({ default: true }) is_active!: boolean;
}
const ProductVariantSchema = SchemaFactory.createForClass(ProductVariant);




@Schema({ timestamps: true })
export class Product {

  @Prop({ required: true, unique: true }) zoho_item_id!: string;


  @Prop() zoho_group_id!: string;


  @Prop({ required: true }) name!: string;
  @Prop() description!: string;
  @Prop() sku!: string;


  @Prop() category_id!: string;
  @Prop() category_name!: string;
  @Prop() manufacturer!: string;

  @Prop() price!: number;
  @Prop() stock!: number;


  @Prop() weight!: number;
  @Prop() weight_unit!: string;
  @Prop() dimensions_with_unit!: string;

  @Prop() zoho_image_document_id!: string;


  @Prop({ type: ProductImageSchema, default: null }) image!: ProductImage | null;

  @Prop({ default: false }) has_variants!: boolean;


  @Prop({ type: [String], default: [] }) variant_attribute_names!: string[];

  @Prop({ type: [ProductVariantSchema], default: [] }) variants!: ProductVariant[];



  @Prop({ default: true }) is_active!: boolean;
}

export const ProductSchema = SchemaFactory.createForClass(Product);

ProductSchema.index({ category_id: 1 });
ProductSchema.index({ is_active: 1 });
ProductSchema.index({ price: 1 });
ProductSchema.index({ has_variants: 1 });
ProductSchema.index({ zoho_group_id: 1 });
ProductSchema.index({ 'variants.zoho_item_id': 1 });

ProductSchema.index({
  name: 'text',
  description: 'text',
});