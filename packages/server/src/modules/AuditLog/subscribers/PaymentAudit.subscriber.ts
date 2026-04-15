import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { events } from '@/common/events/events';
import { AuditLogService } from '../AuditLog.service';

/**
 * Stripe webhook audit events. The raw Stripe event payload is large and
 * contains PII (card last-4, customer email, full customer object); we only
 * forward the identifiers needed to correlate with Stripe's dashboard.
 *
 * Tenant scope: checkout.session.completed fires in a webhook (public
 * route, no tenant header) and the processor is responsible for resolving
 * the tenant from the session. For now we record to `system` scope with
 * whatever tenantId the handler passes; refine if/when the processor
 * consistently attaches one.
 *
 * **Invariant**: handlers must not throw. See `AuthAudit.subscriber.ts`.
 */

// Minimal shape of the Stripe event we actually read. Stripe's own SDK
// types are heavy; redeclaring a narrow local type keeps the subscriber
// focused on the audit surface.
interface StripeEventLike {
  id?: string;
  type?: string;
  data?: { object?: Record<string, unknown> };
}
interface StripeWebhookPayload {
  event?: StripeEventLike;
}

@Injectable()
export class PaymentAuditSubscriber {
  constructor(private readonly auditLog: AuditLogService) {}

  @OnEvent(events.stripeWebhooks.onCheckoutSessionCompleted)
  onCheckoutCompleted(p: StripeWebhookPayload) {
    const obj = p?.event?.data?.object as
      | { id?: string; amount_total?: number; currency?: string }
      | undefined;
    return this.recordStripe('stripe.checkout_completed', p?.event, {
      sessionId: obj?.id,
      amount: obj?.amount_total,
      currency: obj?.currency,
    });
  }

  @OnEvent(events.stripeWebhooks.onAccountUpdated)
  onAccountUpdated(p: StripeWebhookPayload) {
    const obj = p?.event?.data?.object as { id?: string } | undefined;
    return this.recordStripe('stripe.account_updated', p?.event, {
      accountId: obj?.id,
    });
  }

  private recordStripe(
    action: string,
    event: StripeEventLike | undefined,
    extraMetadata: Record<string, unknown>,
  ) {
    return this.auditLog.record({
      scope: 'system',
      action,
      resourceType: 'StripeEvent',
      resourceId: event?.id,
      metadata: {
        stripeEventType: event?.type,
        ...extraMetadata,
      },
    });
  }
}
