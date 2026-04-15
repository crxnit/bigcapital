import knex, { Knex } from 'knex';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '@liaoliaots/nestjs-redis';
import { TenantModel } from '@/modules/System/models/TenantModel';
import { withDistributedLock } from '@/common/utils/distributedLock';

type TenantRow = Pick<TenantModel, 'id' | 'organizationId'> & {
  auditLogRetentionDays?: number | null;
};

// Bounded parallelism across tenants. Keeps aggregate DB load predictable
// regardless of tenant count — no matter how many tenants exist, at most
// N are being swept simultaneously.
const TENANT_SWEEP_CONCURRENCY = 8;

// Chunked-delete page size. Bounds per-statement lock time + binlog
// growth; large backlogs drain iteratively rather than in one shot.
const DELETE_CHUNK_SIZE = 10_000;

/**
 * Daily sweep of tenant-scoped `audit_logs` honoring per-tenant retention
 * overrides (`tenants.audit_log_retention_days`) with a global fallback
 * (`auditLog.retentionDays`, default 180).
 *
 * Runs with bounded parallelism across tenants and chunked DELETEs per
 * tenant so a large backlog doesn't hold a table lock or blow the binlog.
 * Each tenant gets a short-lived Knex connection that is destroyed in a
 * `finally` block.
 */
@Injectable()
export class AuditLogCleanupJob {
  private readonly logger = new Logger(AuditLogCleanupJob.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,

    @Inject(TenantModel.name)
    private readonly tenantModel: typeof TenantModel,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async sweep() {
    if (!this.configService.get<boolean>('auditLog.enabled')) return;

    // Run exactly once per cluster, not once per replica. Lock TTL of
    // 1 hour is well above the worst-case sweep time (chunked DELETE
    // across all tenants). If a holder crashes, the lock auto-releases.
    await withDistributedLock(
      this.redisService,
      'cron:audit-log-cleanup',
      60 * 60 * 1000,
      () => this.sweepLocked(),
    );
  }

  private async sweepLocked() {

    // `auditLog.retentionDays` is guaranteed by the config registration
    // (defaults to 180 if env is unset); no local fallback needed.
    const defaultDays = this.configService.get<number>('auditLog.retentionDays');

    let tenants: TenantRow[];
    try {
      tenants = (await this.tenantModel
        .query()
        .select(
          'id',
          'organization_id as organizationId',
          'audit_log_retention_days as auditLogRetentionDays',
        )) as any;
    } catch (err) {
      this.logger.error('Audit-log cleanup: failed to list tenants', (err as Error)?.stack);
      return;
    }

    // Bounded-concurrency sweep. One slow/failing tenant doesn't block
    // the rest — each sweepTenant catches its own errors internally.
    for (let i = 0; i < tenants.length; i += TENANT_SWEEP_CONCURRENCY) {
      const slice = tenants.slice(i, i + TENANT_SWEEP_CONCURRENCY);
      await Promise.all(slice.map((t) => this.sweepTenant(t, defaultDays)));
    }
  }

  private async sweepTenant(tenant: TenantRow, defaultDays: number): Promise<void> {
    const days =
      tenant.auditLogRetentionDays && tenant.auditLogRetentionDays > 0
        ? tenant.auditLogRetentionDays
        : defaultDays;
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const tenantKnex = this.buildTenantKnex(tenant.organizationId);
    try {
      const deleted = await this.chunkedDelete(tenantKnex, cutoff);
      if (deleted > 0) {
        this.logger.log(
          `Deleted ${deleted} audit_logs rows for tenant=${tenant.organizationId} (retention=${days}d)`,
        );
      }
    } catch (err) {
      this.logger.error(
        `Audit-log cleanup failed for tenant=${tenant.organizationId}`,
        (err as Error)?.stack,
      );
    } finally {
      // TODO: wrap `destroy()` in its own try/catch — an error here (already
      // destroyed, network mid-tear-down) currently re-throws and masks the
      // original sweepTenant error. Low-priority; hasn't been observed.
      await tenantKnex.destroy();
    }
  }

  /**
   * Deletes rows older than `cutoff` in `DELETE_CHUNK_SIZE`-sized batches.
   * Loop terminates when a chunk comes back smaller than the size (nothing
   * left to delete). Each iteration is one bounded DELETE statement so
   * lock time and replication lag stay predictable on large backlogs.
   */
  private async chunkedDelete(k: Knex, cutoff: Date): Promise<number> {
    let total = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const deleted = await k('audit_logs')
        .where('created_at', '<', cutoff)
        .limit(DELETE_CHUNK_SIZE)
        .delete();
      total += deleted;
      if (deleted < DELETE_CHUNK_SIZE) break;
    }
    return total;
  }

  private buildTenantKnex(organizationId: string): Knex {
    const prefix = this.configService.get<string>('tenantDatabase.dbNamePrefix') || 'bigcapital_tenant_';
    const portRaw = this.configService.get('tenantDatabase.port');
    const port = portRaw === undefined || portRaw === null ? undefined : Number(portRaw);
    return knex({
      client: this.configService.get('tenantDatabase.client'),
      connection: {
        host: this.configService.get('tenantDatabase.host'),
        port: Number.isFinite(port) ? port : undefined,
        user: this.configService.get('tenantDatabase.user'),
        password: this.configService.get('tenantDatabase.password'),
        database: `${prefix}${organizationId}`,
        charset: 'utf8',
      },
      // max: 2 lets chunked-delete iterations reuse a connection while
      // still leaving headroom for retry-on-reconnect. Still very small —
      // we don't want cleanup to crowd out user-facing queries.
      pool: { min: 0, max: 2 },
    });
  }
}
