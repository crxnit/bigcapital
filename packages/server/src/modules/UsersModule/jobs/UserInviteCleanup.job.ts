import { Cron, CronExpression } from '@nestjs/schedule';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { RedisService } from '@liaoliaots/nestjs-redis';
import { UserInvite } from '../models/InviteUser.model';
import { withDistributedLock } from '@/common/utils/distributedLock';

// Matches the 24h window enforced by the `notExpired` modifier in the
// UserInvite model. If that window changes, update this too (or lift the
// value to config).
const INVITE_TTL_SECONDS = 24 * 60 * 60;

/**
 * Sweeps expired user-invite tokens out of the system DB. Rows older than
 * the TTL cannot be accepted (the model's `notExpired` modifier blocks
 * redemption), but unused or aborted invites accumulate and keep email
 * addresses on file longer than needed. Runs daily.
 */
@Injectable()
export class UserInviteCleanupJob {
  private readonly logger = new Logger(UserInviteCleanupJob.name);

  constructor(
    private readonly redisService: RedisService,

    @Inject(UserInvite.name)
    private readonly userInviteModel: typeof UserInvite,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async sweepExpired() {
    // Cluster-wide lock: one replica per cron firing.
    await withDistributedLock(
      this.redisService,
      'cron:user-invite-cleanup',
      10 * 60 * 1000,
      () => this.sweepLocked(),
    );
  }

  private async sweepLocked() {
    const cutoff = new Date(Date.now() - INVITE_TTL_SECONDS * 1000);
    try {
      const deleted = await this.userInviteModel
        .query()
        .where('created_at', '<', cutoff)
        .delete();
      if (deleted > 0) {
        this.logger.log(`Deleted ${deleted} expired user-invite tokens`);
      }
    } catch (error) {
      this.logger.error('User-invite cleanup failed', (error as Error)?.stack);
    }
  }
}
