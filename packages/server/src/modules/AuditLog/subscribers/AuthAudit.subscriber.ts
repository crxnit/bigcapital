import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { events } from '@/common/events/events';
import {
  IAuthSignedInEventPayload,
  IAuthSignedUpEventPayload,
  IAuthSignUpVerifiedEventPayload,
  IAuthSendedResetPassword,
  IAuthResetedPasswordEventPayload,
} from '@/modules/Auth/Auth.interfaces';
import { AuditLogService } from '../AuditLog.service';

/**
 * Records authentication lifecycle events into `system_audit_logs`. These
 * events happen before (or at the moment of) tenant selection, so they
 * belong in the system-scoped table rather than any one tenant DB.
 *
 * Passwords, tokens, and verify tokens are never forwarded — payload
 * shapes that include them are destructured so the sensitive fields stay
 * out of metadata. The redaction layer in AuditLogService is a second line
 * of defense if anyone adds a field that matches the sensitive-key regex.
 *
 * **Invariant**: handlers must not throw. `AuditLogService.record()` catches
 * its own errors, so a handler that only calls `record()` is implicitly
 * safe. If a handler grows additional logic, wrap the new code in
 * try/catch — an unhandled rejection here becomes an unhandled-promise
 * warning with no context, not a logged failure.
 */
@Injectable()
export class AuthAuditSubscriber {
  constructor(private readonly auditLog: AuditLogService) {}

  @OnEvent(events.auth.signIn)
  async onSignIn(payload: IAuthSignedInEventPayload) {
    await this.auditLog.record({
      scope: 'system',
      action: 'auth.login.success',
      userId: payload.user?.id ?? null,
      metadata: { email: payload.email },
    });
  }

  @OnEvent(events.auth.signUp)
  async onSignUp(payload: IAuthSignedUpEventPayload) {
    await this.auditLog.record({
      scope: 'system',
      action: 'auth.signup.completed',
      userId: payload.user?.id ?? null,
      tenantId: payload.tenant?.id ?? null,
      metadata: { email: payload.user?.email },
    });
  }

  @OnEvent(events.auth.signUpConfirmed)
  async onEmailVerified(payload: IAuthSignUpVerifiedEventPayload) {
    await this.auditLog.record({
      scope: 'system',
      action: 'auth.email_verified',
      userId: payload.userId ?? null,
      metadata: { email: payload.email },
    });
  }

  @OnEvent(events.auth.sendResetPassword)
  async onPasswordResetRequested(payload: IAuthSendedResetPassword) {
    await this.auditLog.record({
      scope: 'system',
      action: 'auth.password_reset.requested',
      userId: payload.user?.id ?? null,
      metadata: { email: payload.user?.email },
    });
  }

  @OnEvent(events.auth.resetPassword)
  async onPasswordResetCompleted(payload: IAuthResetedPasswordEventPayload) {
    await this.auditLog.record({
      scope: 'system',
      action: 'auth.password_reset.completed',
      userId: payload.user?.id ?? null,
      metadata: { email: payload.user?.email },
    });
  }

  @OnEvent(events.auth.loginFailed)
  async onLoginFailed(payload: { email: string }) {
    await this.auditLog.record({
      scope: 'system',
      action: 'auth.login.failed',
      // Explicit nulls: failed logins are unauthenticated by definition,
      // and populating userId (or a reason field) would give admins a
      // direct DB-queryable oracle for which emails map to real users.
      // Server-side debug logs retain the distinction for forensics.
      userId: null,
      metadata: { email: payload.email },
    });
  }
}
