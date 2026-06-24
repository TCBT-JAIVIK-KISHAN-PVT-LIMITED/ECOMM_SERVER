import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

@Schema({ _id: false })
class OTP {
  @Prop()
  code!: string;

  @Prop()
  expires_at!: Date;

  @Prop({ default: 0 })
  attempts!: number;
}

@Schema({ _id: true })
class Address {
  @Prop()
  label?: string;

  @Prop({ required: true })
  line1!: string;

  @Prop()
  line2?: string;

  @Prop()
  receiver_name?: string;

  @Prop()
  receiver_phone?: string;

  @Prop({ required: true })
  city!: string;

  @Prop({ required: true })
  state!: string;

  @Prop({ required: true })
  pincode!: string;
}

@Schema({
  timestamps: {
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
})
export class User {
  _id!: Types.ObjectId;

  @Prop({ required: true, unique: true })
  mobile_number!: string;

  @Prop()
  name?: string;

  @Prop({ sparse: true })
  email?: string;

  @Prop({ type: OTP })
  otp?: OTP | null;

  @Prop({ type: [Address], default: [] })
  addresses!: Address[];

  @Prop({ type: [String], default: [] })
  fcm_tokens!: string[];

  @Prop({ default: true })
  is_active!: boolean;

  @Prop({ default: false })
  is_deleted!: boolean;

  @Prop()
  last_login_at?: Date;

  @Prop()
  zoho_contact_id?: string;
}

export const UserSchema = SchemaFactory.createForClass(User);
