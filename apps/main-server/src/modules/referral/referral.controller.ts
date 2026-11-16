import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ReferralService } from './referral.service';

@Controller('referrals')
export class ReferralController {
  constructor(private readonly referralService: ReferralService) { }

  /**
   * GET /referrals/leaderboard?userId=...
   * Returns current week info, live top referrers, last week's winner, and user's own stats/code.
   */
  @Get('leaderboard')
  async getLeaderboard(@Query('userId') userId?: string) {
    return this.referralService.getDashboardAndLeaderboard(userId);
  }

  /**
   * POST /referrals/apply
   * Body: { userId: string, referralCode: string, deviceId?: string }
   */
  @Post('apply')
  async applyReferralCode(
    @Body()
    body: { userId: string; referralCode: string; deviceId?: string },
  ) {
    return this.referralService.applyReferralCode(
      body.userId,
      body.referralCode,
      body.deviceId,
    );
  }

  /**
   * GET /referrals/code/:userId
   * Ensures and returns the user's unique referral code.
   */
  @Get('code/:userId')
  async getUserReferralCode(@Param('userId') userId: string) {
    const code = await this.referralService.ensureUserReferralCode(userId);
    return { referral_code: code };
  }

  /**
   * GET /referrals/admin/winners
   * For Admin/Support team to view weekly winners with full mobile numbers & addresses.
   */
  @Get('admin/winners')
  async getAdminWinners() {
    return this.referralService.getAdminWinners();
  }

  /**
   * PATCH /referrals/admin/winners/:weekKey/status
   * Updates winner contact_status ('pending_contact' | 'contacted' | 'dispatched')
   */
  @Patch('admin/winners/:weekKey/status')
  async updateWinnerStatus(
    @Param('weekKey') weekKey: string,
    @Body()
    body: { contact_status: 'pending_contact' | 'contacted' | 'dispatched' },
  ) {
    return this.referralService.updateWinnerContactStatus(
      weekKey,
      body.contact_status,
    );
  }
}

