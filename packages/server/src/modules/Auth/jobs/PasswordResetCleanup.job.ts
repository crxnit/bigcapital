import { Cron, CronExpression } from '@nestjs/schedule';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '@liaoliaots/nestjs-redis';
import { PasswordReset } from '../models/PasswordReset';
import { withDistributedLock } from '@/common/utils/distributedLock';

/**
 * Sweeps expired password-reset tokens out of the system DB.
 *
 * Token TTL is enforced at redemption time in `AuthResetPasswordService`,
 * but without a sweep the table grows forever and leaked DB backups retain
 * usable tokens across restores. Runs hourly.
 */
@Injectable()
export class PasswordResetCleanupJob {
  private readonly logger = new Logger(PasswordResetCleanupJob.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,

    @Inject(PasswordReset.name)
    private readonly passwordResetModel: typeof PasswordReset,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async sweepExpired() {
    // Cluster-wide lock: one replica per cron firing, not one per replica.
    await withDistributedLock(
      this.redisService,
      'cron:password-reset-cleanup',
      10 * 60 * 1000,
      () => this.sweepLocked(),
    );
  }

  private async sweepLocked() {
    const ttlSeconds = this.configService.get<number>('resetPasswordSeconds');
    if (!ttlSeconds || ttlSeconds <= 0) return;

    const cutoff = new Date(Date.now() - ttlSeconds * 1000);
    try {
      const deleted = await this.passwordResetModel
        .query()
        .where('created_at', '<', cutoff)
        .delete();
      if (deleted > 0) {
        this.logger.log(`Deleted ${deleted} expired password-reset tokens`);
      }
    } catch (error) {
      this.logger.error('Password-reset cleanup failed', (error as Error)?.stack);
    }
  }
}
