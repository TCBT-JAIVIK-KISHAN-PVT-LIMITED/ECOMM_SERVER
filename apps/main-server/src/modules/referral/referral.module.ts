import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { RedisModule } from '../../common/redis/redis.module';
import { User, UserSchema } from '../users/schemas/user.schema';
import { ReferralController } from './referral.controller';
import { ReferralService } from './referral.service';
import { Referral, ReferralSchema } from './schemas/referral.schema';
import {
  WeeklyReferralWinner,
  WeeklyReferralWinnerSchema,
} from './schemas/weekly-winner.schema';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    RedisModule,
    MongooseModule.forFeature([
      { name: Referral.name, schema: ReferralSchema },
      { name: WeeklyReferralWinner.name, schema: WeeklyReferralWinnerSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [ReferralController],
  providers: [ReferralService],
  exports: [ReferralService],
})
export class ReferralModule {}

