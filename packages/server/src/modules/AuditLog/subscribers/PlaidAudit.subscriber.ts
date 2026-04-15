import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { events } from '@/common/events/events';
import { AuditLogService } from '../AuditLog.service';

/**
 * Plaid-linked-item audit events. The event payload carries `plaidAccessToken`
 * which must never reach the audit log — we destructure it out of metadata
 * explicitly, and the redaction layer's `/token/i` rule is a second line of
 * defense if a future payload shape re-adds it under a different name.
 *
 * **Invariant**: handlers must not throw. See `AuthAudit.subscriber.ts`.
 */

interface PlaidItemCreatedPayload {
  plaidItemId?: string;
  plaidInstitutionId?: string;
  // plaidAccessToken is intentionally NOT read here.
}
interface PlaidTransactionsSyncedPayload {
  plaidItemId?: string;
  added?: unknown[];
  modified?: unknown[];
  removed?: unknown[];
}

@Injectable()
export class PlaidAuditSubscriber {
  constructor(private readonly auditLog: AuditLogService) {}

  @OnEvent(events.plaid.onItemCreated)
  onItemCreated(p: PlaidItemCreatedPayload) {
    return this.recordPlaid('plaid.item_created', p.plaidItemId, {
      plaidInstitutionId: p.plaidInstitutionId,
    });
  }

  @OnEvent(events.plaid.onTransactionsSynced)
  onTransactionsSynced(p: PlaidTransactionsSyncedPayload) {
    return this.recordPlaid('plaid.transactions_synced', p?.plaidItemId, {
      added: p?.added?.length ?? 0,
      modified: p?.modified?.length ?? 0,
      removed: p?.removed?.length ?? 0,
    });
  }

  private recordPlaid(
    action: string,
    plaidItemId: string | undefined,
    metadata: Record<string, unknown>,
  ) {
    return this.auditLog.record({
      scope: 'tenant',
      action,
      resourceType: 'PlaidItem',
      resourceId: plaidItemId,
      metadata,
    });
  }
}
