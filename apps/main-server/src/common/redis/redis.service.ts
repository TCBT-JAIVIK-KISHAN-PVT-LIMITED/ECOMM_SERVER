import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  public client!: Redis;

  private isConnected = false;
  private errorLogged = false;

  onModuleInit() {
    const redisUrl = process.env.REDIS_URL;

    try {
      this.client = redisUrl
        ? new Redis(redisUrl, {
          lazyConnect: true,
          maxRetriesPerRequest: 3,
          retryStrategy: (times) => {
            const delay = Math.min(times * 500, 5000);

            if (!this.errorLogged) {
              console.warn(
                `⚠️ Redis unavailable, retrying in ${delay}ms...`,
              );
              this.errorLogged = true;
            }

            return delay;
          },
          enableOfflineQueue: false,
        })
        : new Redis({
          host: '127.0.0.1',
          port: 6379,
          lazyConnect: true,
          maxRetriesPerRequest: 3,
          retryStrategy: (times) => {
            const delay = Math.min(times * 500, 5000);

            if (!this.errorLogged) {
              console.warn(
                `⚠️ Redis unavailable, retrying in ${delay}ms...`,
              );
              this.errorLogged = true;
            }

            return delay;
          },
          enableOfflineQueue: false,
        });

      this.client.on('connect', () => {
        this.isConnected = true;
        this.errorLogged = false;

        console.log('✅ Redis connected');
      });

      this.client.on('ready', () => {
        this.isConnected = true;
        this.errorLogged = false;

        console.log('✅ Redis ready');
      });

      this.client.on('close', () => {
        this.isConnected = false;
      });

      this.client.on('reconnecting', (delay) => {
        this.isConnected = false;

        if (!this.errorLogged) {
          console.warn(`⚠️ Redis reconnecting in ${delay}ms...`);
          this.errorLogged = true;
        }
      });

      this.client.on('error', (error) => {
        this.isConnected = false;

        if (!this.errorLogged) {
          console.warn(`⚠️ Redis error: ${error.message}`);
          this.errorLogged = true;
        }
      });

      this.client.connect().catch((error) => {
        this.isConnected = false;

        if (!this.errorLogged) {
          console.warn(`⚠️ Redis initial connection failed: ${error.message}`);
          this.errorLogged = true;
        }
      });
    } catch (error) {
      this.isConnected = false;
      console.warn('⚠️ Redis initialization failed, fallback mode active');
    }
  }

  onModuleDestroy() {
    if (this.client) {
      this.client.disconnect();
    }
  }

  async set(key: string, value: any, ttl?: number) {
    if (!this.client || !this.isConnected) {
      return;
    }

    try {
      const data = JSON.stringify(value);

      if (ttl) {
        await this.client.set(key, data, 'EX', ttl);
      } else {
        await this.client.set(key, data);
      }
    } catch {
      this.isConnected = false;
    }
  }

  async get(key: string) {
    if (!this.client || !this.isConnected) {
      return null;
    }

    try {
      const data = await this.client.get(key);
      return data ? JSON.parse(data) : null;
    } catch {
      this.isConnected = false;
      return null;
    }
  }

  async del(key: string) {
    if (!this.client || !this.isConnected) {
      return;
    }

    try {
      return await this.client.del(key);
    } catch {
      this.isConnected = false;
      return;
    }
  }
}