import { IsString } from 'class-validator';

export class LoginDto {
  @IsString()
  mobile_number!: string;
}
