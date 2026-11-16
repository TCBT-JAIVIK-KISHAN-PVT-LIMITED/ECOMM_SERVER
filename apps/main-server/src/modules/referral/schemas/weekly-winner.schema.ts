import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type WeeklyReferralWinnerDocument =
  HydratedDocument<WeeklyReferralWinner>;

@Schema({
  timestamps: {
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
})
export class WeeklyReferralWinner {
  _id!: Types.ObjectId;

  @Prop({ required: true, unique: true, index: true })
  week_key!: string;

  @Prop({ required: true })
  week_start!: Date;

  @Prop({ required: true })
  week_end!: Date;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  winner_user_id!: Types.ObjectId;

  @Prop({ required: true })
  winner_name!: string;

  @Prop({ required: true })
  winner_mobile!: string;

  @Prop({ required: true })
  referral_count!: number;

  @Prop({ default: '1 Bag of Govardhan Khanij Khad' })
  prize_name!: string;

  @Prop({
    enum: ['pending_contact', 'contacted', 'dispatched'],
    default: 'pending_contact',
  })
  contact_status!: 'pending_contact' | 'contacted' | 'dispatched';

  created_at?: Date;
  updated_at?: Date;
}

export const WeeklyReferralWinnerSchema =
  SchemaFactory.createForClass(WeeklyReferralWinner);

