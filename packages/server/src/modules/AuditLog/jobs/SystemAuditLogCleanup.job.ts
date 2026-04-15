import { Cron, CronExpression } from '@nestjs/schedule';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '@liaoliaots/nestjs-redis';
import { SystemAuditLog } from '../models/SystemAuditLog.model';
import { withDistributedLock } from '@/common/utils/distributedLock';

/**
 * Daily sweep of system-scoped `system_audit_logs`. Uses the global
 * retention default (`auditLog.retentionDays`, default 180). System events
 * aren't per-tenant, so there's no per-tenant override here.
 */
@Injectable()
export class SystemAuditLogCleanupJob {
  private readonly logger = new Logger(SystemAuditLogCleanupJob.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,

    @Inject(SystemAuditLog.name)
    private readonly systemAuditLogModel: typeof SystemAuditLog,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async sweep() {
    if (!this.configService.get<boolean>('auditLog.enabled')) return;
    // Cluster-wide lock: only one replica runs the sweep per cron firing.
    await withDistributedLock(
      this.redisService,
      'cron:system-audit-log-cleanup',
      30 * 60 * 1000,
      () => this.sweepLocked(),
    );
  }

  private async sweepLocked() {
    const days = this.configService.get<number>('auditLog.retentionDays') ?? 180;
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    try {
      const deleted = await this.systemAuditLogModel
        .query()
        .where('created_at', '<', cutoff)
        .delete();
      if (deleted > 0) {
        this.logger.log(
          `Deleted ${deleted} system_audit_logs rows (retention=${days}d)`,
        );
      }
    } catch (err) {
      this.logger.error('System audit-log cleanup failed', (err as Error)?.stack);
    }
  }
}
