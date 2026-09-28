import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ timestamps: true })
export class ZohoToken {
  @Prop({ required: true, unique: true })
  service!: string;

  @Prop({ required: true })
  access_token!: string;

  @Prop({ required: true })
  refresh_token!: string;

  @Prop({ required: true })
  expires_at!: number;
}

export const ZohoTokenSchema = SchemaFactory.createForClass(ZohoToken);
