import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron } from '@nestjs/schedule';
import { Model, Types } from 'mongoose';
import { RedisService } from '../../common/redis/redis.service';
import { User } from '../users/schemas/user.schema';
import { Referral } from './schemas/referral.schema';
import { WeeklyReferralWinner } from './schemas/weekly-winner.schema';

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // UTC+5:30
const NEW_SIGNUP_WINDOW_MS = 30 * 60 * 1000; // 30 minutes window for brand-new download signup

export interface WeekInfo {
  week_key: string;
  week_start: Date;
  week_end: Date;
  label: string;
  seconds_remaining: number;
}

@Injectable()
export class ReferralService {
  constructor(
    @InjectModel(Referral.name) private referralModel: Model<Referral>,
    @InjectModel(WeeklyReferralWinner.name)
    private winnerModel: Model<WeeklyReferralWinner>,
    @InjectModel(User.name) private userModel: Model<User>,
    private readonly redis: RedisService,
  ) {}

  /**
   * Computes Monday 00:00:00 IST to Sunday 23:59:59.999 IST for a given date.
   */
  getWeekInfo(date: Date = new Date()): WeekInfo {
    const istTime = new Date(date.getTime() + IST_OFFSET_MS);
    const dayOfWeek = istTime.getUTCDay(); // 0 = Sun, 1 = Mon, ... 6 = Sat
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

    const mondayIst = new Date(
      Date.UTC(
        istTime.getUTCFullYear(),
        istTime.getUTCMonth(),
        istTime.getUTCDate() + diffToMonday,
        0,
        0,
        0,
        0,
      ),
    );

    const sundayIst = new Date(
      Date.UTC(
        mondayIst.getUTCFullYear(),
        mondayIst.getUTCMonth(),
        mondayIst.getUTCDate() + 6,
        23,
        59,
        59,
        999,
      ),
    );

    // ISO 8601 week number calculation
    const tempDate = new Date(
      Date.UTC(
        mondayIst.getUTCFullYear(),
        mondayIst.getUTCMonth(),
        mondayIst.getUTCDate(),
      ),
    );
    const dayNum = tempDate.getUTCDay() || 7;
    tempDate.setUTCDate(tempDate.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(tempDate.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil(
      ((tempDate.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
    );
    const isoYear = tempDate.getUTCFullYear();
    const week_key = `${isoYear}-W${String(weekNo).padStart(2, '0')}`;

    const week_start = new Date(mondayIst.getTime() - IST_OFFSET_MS);
    const week_end = new Date(sundayIst.getTime() - IST_OFFSET_MS);

    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    const startLabel = `${mondayIst.getUTCDate()} ${months[mondayIst.getUTCMonth()]}`;
    const endLabel = `${sundayIst.getUTCDate()} ${months[sundayIst.getUTCMonth()]}`;
    const label = `${startLabel} – ${endLabel}`;

    const seconds_remaining = Math.max(
      0,
      Math.floor((week_end.getTime() - Date.now()) / 1000),
    );

    return {
      week_key,
      week_start,
      week_end,
      label,
      seconds_remaining,
    };
  }

  private maskMobile(mobile?: string): string {
    if (!mobile) return '+91 ******';
    const digits = mobile.replace(/\D/g, '');
    if (digits.length >= 10) {
      const last10 = digits.slice(-10);
      return `+91 ${last10.slice(0, 2)}****${last10.slice(6)}`;
    }
    return '+91 ******';
  }

  private formatDisplayName(name?: string, mobile?: string): string {
    if (name && name.trim().length > 0) {
      return name.trim();
    }
    const digits = (mobile ?? '').replace(/\D/g, '');
    if (digits.length >= 4) {
      return `Kisan #${digits.slice(-4)}`;
    }
    return 'TCBT Kisan';
  }

  /**
   * Ensures a user has a unique referral_code (e.g., TCBT4829).
   */
  async ensureUserReferralCode(userId: string): Promise<string> {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid user ID');
    }

    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.referral_code) {
      return user.referral_code;
    }

    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const digits = (user.mobile_number || '').replace(/\D/g, '');
    const suffix = digits.length >= 2 ? digits.slice(-2) : '99';

    for (let attempt = 0; attempt < 15; attempt++) {
      let rand = '';
      for (let i = 0; i < 4; i++) {
        rand += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      const candidate = `TCBT${rand}${suffix}`;
      const existing = await this.userModel.findOne({
        referral_code: candidate,
      });
      if (!existing) {
        user.referral_code = candidate;
        await user.save();
        return candidate;
      }
    }

    const fallback = `TCBT${Date.now().toString(36).toUpperCase().slice(-6)}`;
    user.referral_code = fallback;
    await user.save();
    return fallback;
  }

  /**
   * Applies a friend's referral code ONLY for new downloads / first-time signups.
   */
  async applyReferralCode(
    userId: string,
    rawCode: string,
    deviceId?: string,
  ) {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid user ID');
    }

    const code = (rawCode ?? '').trim().toUpperCase();
    if (!code) {
      throw new BadRequestException('Please enter a referral code');
    }

    const referee = await this.userModel.findById(userId);
    if (!referee) {
      throw new NotFoundException('User not found');
    }

    // 1. Only allow during first-time onboarding (before profile name is already established)
    if (referee.name && referee.name.trim().length > 0) {
      throw new BadRequestException(
        'Referral codes are only valid for new app downloads during first-time registration.',
      );
    }

    // 2. Enforce new-account creation time window (must be a newly created account)
    const createdAt = (referee as any).created_at
      ? new Date((referee as any).created_at).getTime()
      : Date.now();
    if (Date.now() - createdAt > NEW_SIGNUP_WINDOW_MS) {
      throw new BadRequestException(
        'Referral codes are only valid for new app downloads and first-time signups.',
      );
    }

    // 3. Enforce one referral per physical device (new download check)
    const cleanDeviceId = (deviceId ?? '').trim();
    if (cleanDeviceId && this.redis?.client) {
      try {
        const deviceUsed = await this.redis.client.get(
          `referral:device:${cleanDeviceId}`,
        );
        if (deviceUsed) {
          throw new BadRequestException(
            'A referral code has already been used on this device.',
          );
        }
      } catch (err: any) {
        if (err instanceof BadRequestException) throw err;
      }
    }

    if (referee.referred_by) {
      throw new BadRequestException(
        'You have already applied a referral code.',
      );
    }

    const existingReferral = await this.referralModel.findOne({
      referee_id: referee._id,
    });
    if (existingReferral) {
      throw new BadRequestException(
        'You have already applied a referral code.',
      );
    }

    const referrer = await this.userModel.findOne({
      referral_code: { $regex: new RegExp(`^${code}$`, 'i') },
    });

    if (!referrer) {
      throw new BadRequestException(
        'Invalid referral code. Please check and try again.',
      );
    }

    if (referrer._id.toString() === referee._id.toString()) {
      throw new BadRequestException('You cannot use your own referral code.');
    }

    const currentWeek = this.getWeekInfo(new Date());

    await this.referralModel.create({
      referrer_id: referrer._id,
      referee_id: referee._id,
      referral_code_used: referrer.referral_code || code,
      week_key: currentWeek.week_key,
    });

    referee.referred_by = referrer._id;
    referee.referred_at = new Date();
    await referee.save();

    if (cleanDeviceId && this.redis?.client) {
      try {
        await this.redis.client.set(
          `referral:device:${cleanDeviceId}`,
          referee._id.toString(),
        );
      } catch (_) {}
    }

    return {
      success: true,
      message: 'Referral code applied successfully!',
      referrer_name: this.formatDisplayName(
        referrer.name,
        referrer.mobile_number,
      ),
      week_key: currentWeek.week_key,
    };
  }

  /**
   * Finalizes the winner for a completed week if not already recorded.
   */
  async finalizeWeekIfNeeded(weekInfo: WeekInfo) {
    if (Date.now() <= weekInfo.week_end.getTime()) {
      return null; // Week is still active
    }

    const existingWinner = await this.winnerModel
      .findOne({ week_key: weekInfo.week_key })
      .lean();
    if (existingWinner) {
      return existingWinner;
    }

    const topAgg = await this.referralModel.aggregate([
      { $match: { week_key: weekInfo.week_key } },
      {
        $group: {
          _id: '$referrer_id',
          referral_count: { $sum: 1 },
          last_referral_at: { $max: '$created_at' },
        },
      },
      // Tie-breaker: highest count first, then whoever reached that count earliest
      { $sort: { referral_count: -1, last_referral_at: 1 } },
      { $limit: 1 },
    ]);

    if (!topAgg.length) {
      return null;
    }

    const top = topAgg[0];
    const winnerUser = await this.userModel.findById(top._id).lean();
    if (!winnerUser) {
      return null;
    }

    try {
      const created = await this.winnerModel.create({
        week_key: weekInfo.week_key,
        week_start: weekInfo.week_start,
        week_end: weekInfo.week_end,
        winner_user_id: winnerUser._id,
        winner_name: this.formatDisplayName(
          winnerUser.name,
          winnerUser.mobile_number,
        ),
        winner_mobile: winnerUser.mobile_number,
        referral_count: top.referral_count,
        prize_name: '1 Bag of Govardhan Khanij Khad',
        contact_status: 'pending_contact',
      });
      return created.toObject();
    } catch (_) {
      return this.winnerModel.findOne({ week_key: weekInfo.week_key }).lean();
    }
  }

  /**
   * Runs every Monday at 00:05 IST to lock in the previous week's winner.
   */
  @Cron('5 0 * * 1', { timeZone: 'Asia/Kolkata' })
  async handleWeeklyWinnerCron() {
    const lastWeekDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const prevWeekInfo = this.getWeekInfo(lastWeekDate);
    await this.finalizeWeekIfNeeded(prevWeekInfo);
  }

  /**
   * Returns complete leaderboard + current user's referral dashboard.
   */
  async getDashboardAndLeaderboard(userId?: string) {
    const currentWeek = this.getWeekInfo(new Date());
    const prevWeek = this.getWeekInfo(
      new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    );

    // Lazily ensure previous week's winner is finalized
    await this.finalizeWeekIfNeeded(prevWeek);

    // Aggregate all referrers for current week
    const weeklyAgg = await this.referralModel.aggregate([
      { $match: { week_key: currentWeek.week_key } },
      {
        $group: {
          _id: '$referrer_id',
          referral_count: { $sum: 1 },
          last_referral_at: { $max: '$created_at' },
        },
      },
      { $sort: { referral_count: -1, last_referral_at: 1 } },
    ]);

    const top15Raw = weeklyAgg.slice(0, 15);
    const userIds = top15Raw.map((item) => item._id);
    const users = await this.userModel
      .find({ _id: { $in: userIds } })
      .select('name mobile_number referral_code')
      .lean();
    const userMap = new Map(users.map((u) => [u._id.toString(), u]));

    const cleanUserId =
      userId && Types.ObjectId.isValid(userId) ? userId : undefined;

    const leaderboard = top15Raw.map((entry, idx) => {
      const idStr = entry._id.toString();
      const u = userMap.get(idStr);
      return {
        rank: idx + 1,
        user_id: idStr,
        name: this.formatDisplayName(u?.name, u?.mobile_number),
        masked_mobile: this.maskMobile(u?.mobile_number),
        referral_count: entry.referral_count,
        is_me: cleanUserId ? idStr === cleanUserId : false,
      };
    });

    // Fetch last week winner and recent winners
    const recentWinnersDocs = await this.winnerModel
      .find()
      .sort({ week_start: -1 })
      .limit(5)
      .lean();

    const recent_winners = recentWinnersDocs.map((w) => {
      const wInfo = this.getWeekInfo(new Date(w.week_start.getTime() + 3600000));
      return {
        week_key: w.week_key,
        week_label: wInfo.label,
        winner_user_id: w.winner_user_id.toString(),
        winner_name: w.winner_name,
        masked_mobile: this.maskMobile(w.winner_mobile),
        referral_count: w.referral_count,
        prize_name: w.prize_name,
        contact_status: w.contact_status,
        is_me: cleanUserId
          ? w.winner_user_id.toString() === cleanUserId
          : false,
      };
    });

    const last_week_winner =
      recent_winners.find((w) => w.week_key === prevWeek.week_key) ??
      recent_winners[0] ??
      null;

    // Build "me" stats if userId is provided
    let me: any = null;
    let my_referred_friends: any[] = [];

    if (cleanUserId) {
      const uidObj = new Types.ObjectId(cleanUserId);
      const userDoc = await this.userModel.findById(uidObj);
      if (userDoc) {
        const referralCode = await this.ensureUserReferralCode(cleanUserId);
        const myRankIndex = weeklyAgg.findIndex(
          (item) => item._id.toString() === cleanUserId,
        );
        const weeklyCount =
          myRankIndex >= 0 ? weeklyAgg[myRankIndex].referral_count : 0;
        const currentRank = myRankIndex >= 0 ? myRankIndex + 1 : null;
        const totalCount = await this.referralModel.countDocuments({
          referrer_id: uidObj,
        });

        const recentRefDocs = await this.referralModel
          .find({ referrer_id: uidObj })
          .sort({ created_at: -1 })
          .limit(20)
          .lean();

        const refereeIds = recentRefDocs.map((r) => r.referee_id);
        const referees = await this.userModel
          .find({ _id: { $in: refereeIds } })
          .select('name mobile_number created_at')
          .lean();
        const refereeMap = new Map(referees.map((r) => [r._id.toString(), r]));

        my_referred_friends = recentRefDocs.map((r) => {
          const refUser = refereeMap.get(r.referee_id.toString());
          return {
            id: r._id.toString(),
            name: this.formatDisplayName(
              refUser?.name,
              refUser?.mobile_number,
            ),
            masked_mobile: this.maskMobile(refUser?.mobile_number),
            week_key: r.week_key,
            is_current_week: r.week_key === currentWeek.week_key,
            joined_at: r.created_at,
          };
        });

        const wonRecord = recentWinnersDocs.find(
          (w) => w.winner_user_id.toString() === cleanUserId,
        );

        me = {
          user_id: cleanUserId,
          referral_code: referralCode,
          weekly_referrals: weeklyCount,
          total_referrals: totalCount,
          current_rank: currentRank,
          already_referred: Boolean(userDoc.referred_by),
          won_week: wonRecord
            ? {
                week_key: wonRecord.week_key,
                prize_name: wonRecord.prize_name,
                referral_count: wonRecord.referral_count,
                contact_status: wonRecord.contact_status,
              }
            : null,
        };
      }
    }

    return {
      prize: {
        title: '1 Bag of Govardhan Khanij Khad FREE',
        title_hi: '1 बोरी गोवर्धन खनिज खाद बिल्कुल मुफ़्त!',
        description:
          'Refer the most farmer friends this week (Monday to Sunday) & win 1 bag of Govardhan Khanij Khad free! Our support team will contact the weekly winner via phone/WhatsApp.',
        description_hi:
          'हर हफ्ते (सोमवार से रविवार) सबसे ज़्यादा किसान मित्रों को ऐप रेफर करने वाले विजेता को मिलेगी 1 बोरी गोवर्धन खनिज खाद बिल्कुल मुफ़्त! हमारी टीम विजेता से फ़ोन/व्हाट्सऐप पर संपर्क करेगी।',
      },
      current_week: currentWeek,
      me,
      leaderboard,
      last_week_winner,
      recent_winners,
      my_referred_friends,
    };
  }

  /**
   * Admin / Support endpoint to view weekly winners with full phone numbers & addresses
   * so the support team can contact them via Phone/WhatsApp.
   */
  async getAdminWinners() {
    const prevWeek = this.getWeekInfo(
      new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    );
    await this.finalizeWeekIfNeeded(prevWeek);

    const winners = await this.winnerModel
      .find()
      .sort({ week_start: -1 })
      .limit(50)
      .lean();

    const userIds = winners.map((w) => w.winner_user_id);
    const users = await this.userModel
      .find({ _id: { $in: userIds } })
      .select('name mobile_number email addresses')
      .lean();
    const userMap = new Map(users.map((u) => [u._id.toString(), u]));

    return winners.map((w) => {
      const u = userMap.get(w.winner_user_id.toString());
      return {
        ...w,
        winner_addresses: u?.addresses ?? [],
        winner_email: u?.email ?? null,
      };
    });
  }

  async updateWinnerContactStatus(
    weekKey: string,
    contactStatus: 'pending_contact' | 'contacted' | 'dispatched',
  ) {
    const updated = await this.winnerModel.findOneAndUpdate(
      { week_key: weekKey },
      { contact_status: contactStatus },
      { new: true },
    );
    if (!updated) {
      throw new NotFoundException(`Winner for week ${weekKey} not found`);
    }
    return updated;
  }
}

