import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EducationController } from './education.controller';
import { EducationService } from './education.service';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [ConfigModule, UsersModule],
  controllers: [EducationController],
  providers: [EducationService],
  exports: [EducationService],
})
export class EducationModule {}
