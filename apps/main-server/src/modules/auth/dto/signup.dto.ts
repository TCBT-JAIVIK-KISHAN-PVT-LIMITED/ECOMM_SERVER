import { IsString, IsNotEmpty } from 'class-validator';

export class SignupDto {
  @IsString()
  mobile_number!: string;

  @IsNotEmpty()
  @IsString()
  name!: string;
}
