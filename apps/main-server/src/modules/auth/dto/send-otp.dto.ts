import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class SendOtpDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(20)
  mobile_number: string;
}
