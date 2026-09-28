import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RefreshDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  session_id: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  refresh_token: string;
}
