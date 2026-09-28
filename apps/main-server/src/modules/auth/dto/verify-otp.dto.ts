import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  Matches,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class VerifyOtpDto {
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }: { value: any }) => (value as string)?.trim())
  @Matches(/^\+?[1-9]\d{9,14}$/, {
    message: 'Invalid mobile number format',
  })
  mobile_number!: string;

  @IsString()
  @IsNotEmpty()
  @Transform(({ value }: { value: any }) => (value as string)?.trim())
  @Length(6, 6)
  otp!: string;

  @IsString()
  @IsNotEmpty()
  @Transform(({ value }: { value: any }) => (value as string)?.trim())
  @MaxLength(128)
  device_id!: string;

  @IsString()
  @IsOptional()
  @Transform(({ value }: { value: any }) => (value as string)?.trim())
  @MaxLength(128)
  guest_session_id?: string;
}
