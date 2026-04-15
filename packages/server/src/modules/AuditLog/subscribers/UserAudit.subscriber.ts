import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { events } from '@/common/events/events';
import { AuditLogService } from '../AuditLog.service';

/**
 * User lifecycle auditing.
 *
 * `inviteUser.sendInvite` and `acceptInvite` are system-wide (a user can be
 * invited before a tenant context is fully established in CLS), so they go
 * to `system_audit_logs` with an explicit `tenantId`. Activate / deactivate
 * / delete happen inside a tenant request and go to the tenant-scoped
 * `audit_logs`.
 *
 * The `inviteToken` field on the payload is never forwarded into metadata
 * — the value grants invite-acceptance rights and must not appear in logs.
 *
 * **Invariant**: handlers must not throw. See `AuthAudit.subscriber.ts` for
 * the rationale; same contract applies here.
 */

// Shared payload shapes emitted across UsersModule. Defined locally because
// the individual event interfaces live in domain modules and use `any`;
// pinning the subset this subscriber reads avoids coupling to those files
// while still catching field renames here.
interface InviteEventPayload {
  tenantId?: number | null;
  user?: { id?: number; email?: string; tenantId?: number | null };
}
interface TenantUserEventPayload {
  userId: number;
  tenantUser?: { email?: string };
}

@Injectable()
export class UserAuditSubscriber {
  constructor(private readonly auditLog: AuditLogService) {}

  // ── Invite lifecycle (system-scoped) ─────────────────────────────────────

  @OnEvent(events.inviteUser.sendInvite)
  onSendInvite(p: InviteEventPayload) {
    return this.recordInvite('user.invited', p);
  }

  @OnEvent(events.inviteUser.acceptInvite)
  onAcceptInvite(p: InviteEventPayload) {
    return this.recordInvite('user.invite_accepted', p);
  }

  private recordInvite(action: string, p: InviteEventPayload) {
    return this.auditLog.record({
      scope: 'system',
      action,
      userId: p.user?.id ?? null,
      tenantId: p.tenantId ?? p.user?.tenantId ?? null,
      resourceType: 'User',
      resourceId: p.user?.id,
      metadata: { email: p.user?.email },
    });
  }

  // ── Per-tenant user admin (tenant-scoped) ────────────────────────────────

  @OnEvent(events.tenantUser.onActivated)
  onUserActivated(p: TenantUserEventPayload) {
    return this.recordTenantUserEvent('user.activated', p);
  }

  @OnEvent(events.tenantUser.onInactivated)
  onUserInactivated(p: TenantUserEventPayload) {
    return this.recordTenantUserEvent('user.deactivated', p);
  }

  @OnEvent(events.tenantUser.onDeleted)
  onUserDeleted(p: TenantUserEventPayload) {
    return this.recordTenantUserEvent('user.deleted', p);
  }

  private recordTenantUserEvent(action: string, p: TenantUserEventPayload) {
    return this.auditLog.record({
      scope: 'tenant',
      action,
      resourceType: 'TenantUser',
      resourceId: p.userId,
      metadata: { email: p.tenantUser?.email },
    });
  }
}
