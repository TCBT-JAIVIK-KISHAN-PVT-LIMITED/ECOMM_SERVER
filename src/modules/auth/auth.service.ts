import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { User } from '../users/schemas/user.schema';
import { CrmService } from '../../zoho/crm/crm.service';
import { ZohoAuthService } from '../../zoho/core/zoho-auth.service';
import { RedisService } from '../../common/redis/redis.service';
import { CartService } from '../cart/cart.service';
import axios from 'axios';

const OTP_TTL_SEC = 300;
const OTP_COOLDOWN_SEC = 60;
const RL_WINDOW_SEC = 900;
const SEND_LIMIT = 5;
const VERIFY_LIMIT = 10;
const OTP_MAX_ATTEMPTS = 5;

const REFRESH_TTL_SEC = 30 * 24 * 60 * 60;

function otpKey(mobile: string) {
  return `auth:otp:${mobile}`;
}
function otpCooldownKey(mobile: string) {
  return `auth:otp:cooldown:${mobile}`;
}
function otpSendRlKey(mobile: string) {
  return `auth:otp:send:${mobile}`;
}
function otpVerifyRlKey(mobile: string) {
  return `auth:otp:verify:${mobile}`;
}
function sessKey(sid: string) {
  return `auth:sess:${sid}`;
}
function userSessionsKey(uid: string) {
  return `auth:user_sessions:${uid}`;
}
function deviceSessionKey(deviceId: string) {
  return `auth:device_session:${deviceId}`;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    private jwtService: JwtService,
    private zohoCRMService: CrmService,
    private zohoService: ZohoAuthService,
    private redis: RedisService,
    private cartService: CartService,
  ) {}

  // ADD THIS HELPER INSIDE CLASS
  private getRedis() {
    if (!this.redis?.client) return null;
    return this.redis.client;
  }

  private normalizeMobile(input: string): string {
    const raw = (input ?? '').trim();
    const stripped = raw.replace(/[\s\-().]/g, '');

    if (stripped.startsWith('+')) return stripped;
    if (stripped.startsWith('00')) return `+${stripped.slice(2)}`;

    const defaultCc = (process.env.DEFAULT_COUNTRY_CODE ?? '+91').trim();
    const digitsOnly = stripped.replace(/\D/g, '');

    if (digitsOnly.length === 10) return `${defaultCc}${digitsOnly}`;
    if (digitsOnly.length === 11 && digitsOnly.startsWith('0'))
      return `${defaultCc}${digitsOnly.slice(1)}`;

    return stripped;
  }

  private async setOtpPayloadKeepingTtl(
    mobile: string,
    payload: { hash: string; attempts: number },
  ) {
    const r = this.redis.client;
    const key = otpKey(mobile);
    const ttl = await r.ttl(key);
    const ttlToUse = ttl > 0 ? ttl : OTP_TTL_SEC;
    await r.set(key, JSON.stringify(payload), 'EX', ttlToUse);
  }

  async sendOtp(mobile_number: string) {
    const mobile = this.normalizeMobile(mobile_number);
    const r = this.getRedis();

    // ─── Play Store / Test bypass ────────────────────────────────────────────
    const testMobile = (process.env.TEST_MOBILE ?? '').trim();
    const testOtp = (process.env.TEST_OTP ?? '').trim();
    if (testMobile && testOtp && mobile === testMobile) {
      // Ensure user record exists, skip SMS entirely
      let testUser = await this.userModel.findOne({ mobile_number: mobile });
      if (!testUser) {
        testUser = await this.userModel.create({ mobile_number: mobile });
      }
      const testHash = await bcrypt.hash(testOtp, 10);
      testUser.otp = {
        code: testHash,
        expires_at: new Date(Date.now() + OTP_TTL_SEC * 1000),
        attempts: 0,
      };
      await testUser.save();
      try {
        if (r) {
          await r.set(
            otpKey(mobile),
            JSON.stringify({ hash: testHash, attempts: 0 }),
            'EX',
            OTP_TTL_SEC,
          );
        }
      } catch (_) {}
      console.log(`[TEST] OTP skipped for test mobile. Use fixed OTP: ${testOtp}`);
      return { message: 'OTP sent successfully' };
    }
    // ─────────────────────────────────────────────────────────────────────────

    try {
      if (r) {
        const sendCount = await r.incr(otpSendRlKey(mobile));
        if (sendCount === 1) {
          await r.expire(otpSendRlKey(mobile), RL_WINDOW_SEC);
        }

        if (sendCount > SEND_LIMIT) {
          throw new BadRequestException('Too many OTP requests');
        }
      }
    } catch (err: any) {
      console.warn('Redis error (rate limit skipped):', err?.message);
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const hash = await bcrypt.hash(otp, 10);

    let user = await this.userModel.findOne({ mobile_number: mobile }); // ✅ FIX

    if (!user) {
      user = await this.userModel.create({ mobile_number: mobile }); // ✅ FIX
    }

    user.otp = {
      code: hash,
      expires_at: new Date(Date.now() + OTP_TTL_SEC * 1000),
      attempts: 0,
    };

    await user.save();

    try {
      if (r) {
        await r.set(
          otpKey(mobile),
          JSON.stringify({ hash, attempts: 0 }),
          'EX',
          OTP_TTL_SEC,
        );

        await r.set(otpCooldownKey(mobile), '1', 'EX', OTP_COOLDOWN_SEC);
      }
    } catch (err: any) {
      console.warn('Redis error (OTP cache skipped):', err?.message);
    }

    try {
      await axios.post(
        `https://control.msg91.com/api/v5/oneapi/api/flow/login-sms1/run`,
        {
          data: {
            sendTo: [
              {
                to: [
                  {
                    mobiles: `+91${mobile}`,
                    variables: {
                      var: { type: 'text', value: otp },
                    },
                  },
                ],
              },
            ],
          },
        },
        {
          headers: {
            authkey: process.env.MSG91_AUTH_KEY,
            'Content-Type': 'application/json',
          },
        },
      );
    } catch (error: any) {
      console.error('MSG91 Error:', error.response?.data || error.message);
      throw new Error('Failed to send OTP');
    }

    return { message: 'OTP sent successfully' };
  }

  async verifyOtp(input: {
    mobile_number: string;
    otp: string;
    device_id: string;
    guest_session_id?: string;
  }) {
    const mobile = this.normalizeMobile(input.mobile_number);
    const r = this.getRedis();

    // ─── Play Store / Test bypass ────────────────────────────────────────────
    const testMobile = (process.env.TEST_MOBILE ?? '').trim();
    const testOtp = (process.env.TEST_OTP ?? '').trim();
    if (testMobile && testOtp && mobile === testMobile) {
      if (input.otp !== testOtp) {
        throw new UnauthorizedException('Invalid OTP');
      }
      // Proceed directly to session creation — skip Redis OTP lookup
    } else {
    // ─────────────────────────────────────────────────────────────────────────

    let raw: string | null = null;

    try {
      if (r) {
        raw = await r.get(otpKey(mobile));
      }
    } catch (err: any) {
      console.warn('Redis error (OTP fetch skipped):', err?.message);
    }

    if (!raw) throw new BadRequestException('OTP expired');

    const payload = JSON.parse(raw);

    const ok = await bcrypt.compare(input.otp, payload.hash);
    if (!ok) {
      const attempts = (payload.attempts ?? 0) + 1;

      try {
        if (r) {
          if (attempts >= OTP_MAX_ATTEMPTS) {
            await r.del(otpKey(mobile));
          } else {
            await this.setOtpPayloadKeepingTtl(mobile, {
              hash: payload.hash,
              attempts,
            });
          }
        }
      } catch (err: any) {
        console.warn('Redis error (OTP update skipped):', err?.message);
      }

      throw new UnauthorizedException('Invalid OTP');
    }
    } // end of non-test OTP block

    const user = await this.userModel.findOne({ mobile_number: mobile }); // ✅ FIX
    if (!user) throw new UnauthorizedException('User not found');

    user.last_login_at = new Date();
    user.otp = null;
    await user.save();

    // ✅ MERGE GUEST CART (ADD HERE)
    if (input.guest_session_id?.trim()) {
      try {
        await this.cartService.mergeGuestIntoUser(
          input.guest_session_id,
          user._id.toString(),
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn('Cart merge failed:', message);
      }
    }
    // ✅ DEVICE SESSION CLEANUP (SAFE)
    try {
      if (r) {
        const oldSid = await r.get(deviceSessionKey(input.device_id));
        if (oldSid) {
          const uid = user._id.toString();
          await r.del(sessKey(oldSid));
          await r.srem(userSessionsKey(uid), oldSid);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('Redis error (device cleanup skipped):', message);
    }

    const sid = uuidv4();
    const refresh = randomBytes(48).toString('base64url');
    const rtHash = await bcrypt.hash(refresh, 10);
    const now = Date.now();
    const uid = user._id.toString();

    // ✅ SESSION STORE (SAFE)
    try {
      if (r) {
        await r.hset(sessKey(sid), {
          uid,
          rt_hash: rtHash,
          device_id: input.device_id,
          created_at: String(now),
          last_used_at: String(now),
        });

        await r.expire(sessKey(sid), REFRESH_TTL_SEC);
        await r.set(
          deviceSessionKey(input.device_id),
          sid,
          'EX',
          REFRESH_TTL_SEC,
        );
        await r.sadd(userSessionsKey(uid), sid);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('Redis error (session store skipped):', message);
    }

    const access = this.jwtService.sign({ sub: uid, sid });

    return {
      access_token: access,
      refresh_token: refresh,
      session_id: sid,
      user,
    };
  }

  async refresh(session_id: string, refresh_token: string) {
    const r = this.getRedis();
    if (!r) throw new UnauthorizedException('Session unavailable');

    const sess = await r.hgetall(sessKey(session_id));
    if (!sess?.uid || !sess?.rt_hash)
      throw new UnauthorizedException('Invalid session');

    const ok = await bcrypt.compare(refresh_token, sess.rt_hash);
    if (!ok) {
      await r.del(sessKey(session_id));
      await r.srem(userSessionsKey(sess.uid), session_id);

      if (sess?.device_id) {
        const mapped = await r.get(deviceSessionKey(sess.device_id));
        if (mapped === session_id) {
          await r.del(deviceSessionKey(sess.device_id));
        }
      }

      throw new UnauthorizedException('Invalid refresh token');
    }

    const newRefresh = randomBytes(48).toString('base64url');
    const newHash = await bcrypt.hash(newRefresh, 10);

    await r.hset(sessKey(session_id), {
      rt_hash: newHash,
      last_used_at: String(Date.now()),
    });

    await r.expire(sessKey(session_id), REFRESH_TTL_SEC);

    const access = this.jwtService.sign({
      sub: sess.uid,
      sid: session_id,
    });

    return { access_token: access, refresh_token: newRefresh, session_id };
  }

  async logout(session_id: string) {
    const r = this.getRedis();
    if (!r) return { message: 'Logged out' }; // ✅ graceful

    const sess = await r.hgetall(sessKey(session_id));

    if (sess?.uid) {
      await r.srem(userSessionsKey(sess.uid), session_id);
    }

    if (sess?.device_id) {
      const mapped = await r.get(deviceSessionKey(sess.device_id));
      if (mapped === session_id) {
        await r.del(deviceSessionKey(sess.device_id));
      }
    }

    await r.del(sessKey(session_id));

    return { message: 'Logged out' };
  }
}
