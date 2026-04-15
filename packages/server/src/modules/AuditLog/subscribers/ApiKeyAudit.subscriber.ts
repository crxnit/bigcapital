import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { events } from '@/common/events/events';
import { AuditLogService } from '../AuditLog.service';

/**
 * API key lifecycle audit events.
 *
 * Writes to `system_audit_logs` (API keys are system-scoped resources —
 * the raw key value is validated before any tenant context is set). The
 * key string is never forwarded on the event payload and must never land
 * in metadata; only the surrogate `apiKeyId` is logged.
 *
 * `api_key.used` (every-request) is handled separately in PR 4.4 via a
 * BullMQ batch queue; it's not wired here.
 *
 * **Invariant**: handlers must not throw. See `AuthAudit.subscriber.ts`.
 */

interface ApiKeyEventPayload {
  apiKeyId: number;
  name?: string;
  tenantId?: number | null;
  userId?: number | null;
}

@Injectable()
export class ApiKeyAuditSubscriber {
  constructor(private readonly auditLog: AuditLogService) {}

  @OnEvent(events.apiKey.created)
  onCreated(p: ApiKeyEventPayload) {
    return this.recordApiKeyEvent('api_key.created', p, { name: p.name });
  }

  @OnEvent(events.apiKey.revoked)
  onRevoked(p: ApiKeyEventPayload) {
    return this.recordApiKeyEvent('api_key.revoked', p);
  }

  private recordApiKeyEvent(
    action: string,
    p: ApiKeyEventPayload,
    metadata?: Record<string, unknown>,
  ) {
    return this.auditLog.record({
      scope: 'system',
      action,
      userId: p.userId ?? null,
      tenantId: p.tenantId ?? null,
      resourceType: 'ApiKey',
      resourceId: p.apiKeyId,
      metadata,
    });
  }
}
