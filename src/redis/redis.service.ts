import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import Redis from 'ioredis';

export interface CachedNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  senderId?: number;
  senderName?: string;
  channelId?: number;
  channelName?: string;
  courseId?: number;
  link?: string;
  isRead: boolean;
  createdAt: string;
}

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis;
  private readonly ttlRead: number;
  private readonly ttlUnread: number;

  constructor(private configService: ConfigService) {
    const host = this.configService.get<string>('REDIS_HOST', 'localhost');
    const port = this.configService.get<number>('REDIS_PORT', 6379);

    this.ttlRead = this.configService.get<number>('NOTIFICATION_TTL_READ', 604800);
    this.ttlUnread = this.configService.get<number>('NOTIFICATION_TTL_UNREAD', 2592000);

    this.client = new Redis({
      host,
      port,
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => Math.min(times * 100, 3000),
    });

    this.client.on('connect', () => {
      this.logger.log('Connected to Redis');
    });

    this.client.on('error', (err) => {
      this.logger.error('Redis error:', err);
    });
  }

  async onModuleDestroy() {
    await this.client.quit();
  }

  async ping(): Promise<string> {
    return this.client.ping();
  }

  private getUnreadCountKey(userId: number): string {
    return `notifications:unread:${userId}`;
  }

  private getUserNotificationsKey(userId: number): string {
    return `notifications:user:${userId}`;
  }

  private getNotificationTimestampKey(notificationId: string): string {
    return `notification:ts:${notificationId}`;
  }

  async incrementUnreadCount(userId: number): Promise<number> {
    const key = this.getUnreadCountKey(userId);
    return this.client.incr(key);
  }

  async decrementUnreadCount(userId: number): Promise<number> {
    const key = this.getUnreadCountKey(userId);
    const count = await this.client.decr(key);
    if (count < 0) {
      await this.client.set(key, '0');
      return 0;
    }
    return count;
  }

  async getUnreadCount(userId: number): Promise<number> {
    const key = this.getUnreadCountKey(userId);
    const count = await this.client.get(key);
    return count ? parseInt(count, 10) : 0;
  }

  async resetUnreadCount(userId: number): Promise<void> {
    const key = this.getUnreadCountKey(userId);
    await this.client.set(key, '0');
  }

  async addNotification(
    userId: number,
    notification: CachedNotification,
  ): Promise<void> {
    const key = this.getUserNotificationsKey(userId);
    const timestampKey = this.getNotificationTimestampKey(notification.id);

    await this.client.lpush(key, JSON.stringify(notification));
    await this.client.ltrim(key, 0, 99);

    await this.client.set(
      timestampKey,
      Date.now().toString(),
      'EX',
      this.ttlUnread,
    );
  }

  async getNotifications(
    userId: number,
    limit = 50,
  ): Promise<CachedNotification[]> {
    const key = this.getUserNotificationsKey(userId);
    const items = await this.client.lrange(key, 0, limit - 1);
    return items.map((item) => JSON.parse(item));
  }

  async markNotificationAsRead(
    userId: number,
    notificationId: string,
  ): Promise<void> {
    const key = this.getUserNotificationsKey(userId);
    const items = await this.client.lrange(key, 0, -1);

    for (const item of items) {
      const notification = JSON.parse(item) as CachedNotification;
      if (notification.id === notificationId) {
        notification.isRead = true;
        const index = items.indexOf(item);
        await this.client.lset(key, index, JSON.stringify(notification));

        const timestampKey = this.getNotificationTimestampKey(notificationId);
        await this.client.set(timestampKey, Date.now().toString(), 'EX', this.ttlRead);
        break;
      }
    }
  }

  async markChannelNotificationsAsRead(
    userId: number,
    channelId: number,
  ): Promise<void> {
    const key = this.getUserNotificationsKey(userId);
    const items = await this.client.lrange(key, 0, -1);

    for (let i = 0; i < items.length; i++) {
      const notification = JSON.parse(items[i]) as CachedNotification;
      if (notification.channelId === channelId && !notification.isRead) {
        notification.isRead = true;
        await this.client.lset(key, i, JSON.stringify(notification));

        const timestampKey = this.getNotificationTimestampKey(notification.id);
        await this.client.set(timestampKey, Date.now().toString(), 'EX', this.ttlRead);
      }
    }
  }

  async clearUserNotifications(userId: number): Promise<void> {
    const key = this.getUserNotificationsKey(userId);
    await this.client.del(key);
  }

  @Cron(CronExpression.EVERY_6_HOURS)
  async cleanupOldNotifications(): Promise<void> {
    this.logger.log('Running notification cleanup task');

    const pattern = 'notifications:user:*';
    let cursor = '0';

    do {
      const [nextCursor, keys] = await this.client.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        100,
      );
      cursor = nextCursor;

      for (const key of keys) {
        const items = await this.client.lrange(key, 0, -1);
        const now = Date.now();
        const maxAge = this.ttlRead;

        const validItems: string[] = [];
        for (const item of items) {
          const notification = JSON.parse(item) as CachedNotification;
          const timestampKey = this.getNotificationTimestampKey(notification.id);
          const timestamp = await this.client.get(timestampKey);

          if (timestamp) {
            const age = now - parseInt(timestamp, 10);
            if (age < maxAge) {
              validItems.push(item);
            } else {
              await this.client.del(timestampKey);
            }
          } else {
            const createdAt = new Date(notification.createdAt).getTime();
            const age = now - createdAt;
            if (age < this.ttlUnread) {
              validItems.push(item);
            }
          }
        }

        if (validItems.length < items.length) {
          await this.client.del(key);
          if (validItems.length > 0) {
            await this.client.rpush(key, ...validItems.reverse());
          }
          this.logger.log(`Cleaned up ${key}: ${items.length - validItems.length} old notifications`);
        }
      }
    } while (cursor !== '0');

    this.logger.log('Notification cleanup task completed');
  }
}