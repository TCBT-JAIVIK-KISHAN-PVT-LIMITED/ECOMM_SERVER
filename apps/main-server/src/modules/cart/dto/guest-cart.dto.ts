import { IsOptional, IsString, MaxLength } from 'class-validator';

export class GuestCartDto {
  @IsString()
  @IsOptional()
  @MaxLength(128)
  guest_session_id?: string;
}
