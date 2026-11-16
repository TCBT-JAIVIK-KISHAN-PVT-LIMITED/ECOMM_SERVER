import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ReferralDocument = HydratedDocument<Referral>;

@Schema({
  timestamps: {
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
})
export class Referral {
  _id!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  referrer_id!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true })
  referee_id!: Types.ObjectId;

  @Prop({ required: true })
  referral_code_used!: string;

  @Prop({ required: true, index: true })
  week_key!: string;

  created_at?: Date;
  updated_at?: Date;
}

export const ReferralSchema = SchemaFactory.createForClass(Referral);
ReferralSchema.index({ week_key: 1, referrer_id: 1 });

