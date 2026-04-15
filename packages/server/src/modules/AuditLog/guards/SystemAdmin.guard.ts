import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClsService } from 'nestjs-cls';
import { SystemUser } from '@/modules/System/models/SystemUser';

// Short-lived cache for the API-key auth path where `request.user` has
// no email. A single `findById(userId)` per guard hit adds up if the
// same API key hits multiple admin routes in quick succession, so we
// keep a tiny LRU-ish Map keyed by userId with a 30-second TTL.
const USER_EMAIL_CACHE_TTL_MS = 30_000;
const USER_EMAIL_CACHE_MAX = 128;

/**
 * Gates routes to a small allow-list of system administrators by email.
 *
 * v1 design: the list is sourced from `SYSTEM_ADMIN_EMAILS` (comma-
 * separated). Deliberately chosen over adding a new role column because
 * there is exactly one caller today (the system-wide audit-log read
 * endpoint) and the population story for a real admin role needs its
 * own design pass. When we have >1 admin-only route, lift this to a DB
 * column or a dedicated `system_roles` table.
 *
 * Known accepted risk: the allowlist is plaintext env, not hashed or
 * rotatable. An attacker who reads the deploy config (leaked env, SSRF
 * to metadata, misconfigured secret store) learns exactly who to phish.
 * The DB-backed `system_roles` migration closes this when it lands;
 * until then, treat SYSTEM_ADMIN_EMAILS as a credential-class secret in
 * deploy tooling.
 *
 * The guard runs AFTER the existing JWT/ApiKey guards, so CLS.userId is
 * already populated and Passport has attached the JWT payload (or the
 * api-key validation result) to `request.user`.
 *
 * Fast path: the JWT payload carries the user's email in `sub`, so JWT-
 * authenticated requests admit/reject with no DB hit. API-key requests
 * don't expose an email on `request.user`, so those fall back to a
 * single SystemUser lookup.
 */
@Injectable()
export class SystemAdminGuard implements CanActivate {
  private readonly logger = new Logger(SystemAdminGuard.name);

  // Memoized parsed allow-list. Rebuilt only when the env value changes
  // (cheap string compare). Avoids re-splitting on every request.
  private cachedRaw: string | null = null;
  private cachedAllowed: Set<string> = new Set();

  // userId → { email, fetchedAt }. Only consulted by the API-key fallback
  // path; JWT fast-path doesn't need it because `request.user.sub` carries
  // the email directly.
  private readonly emailCache = new Map<
    number,
    { email: string; fetchedAt: number }
  >();

  constructor(
    private readonly configService: ConfigService,
    private readonly cls: ClsService,

    @Inject(SystemUser.name)
    private readonly systemUserModel: typeof SystemUser,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const allowed = this.getAllowedEmails();
    if (allowed.size === 0) {
      // Fail closed — without an explicit allow-list, no one is admin.
      this.logger.warn('SystemAdminGuard denied: SYSTEM_ADMIN_EMAILS is empty.');
      throw new ForbiddenException('System administration is not configured.');
    }

    const userId = this.cls.get<number>('userId');
    if (!userId) {
      throw new ForbiddenException('Authentication required.');
    }

    const email = await this.lookupEmail(context, userId);
    if (!email) {
      throw new ForbiddenException('System administrator access required.');
    }
    if (!allowed.has(email.toLowerCase())) {
      throw new ForbiddenException('System administrator access required.');
    }
    return true;
  }

  /**
   * Returns the allow-list as a Set, re-parsing only when the underlying
   * env-backed config value has changed.
   */
  private getAllowedEmails(): Set<string> {
    const raw = this.configService.get<string>('systemAdmin.emails') || '';
    if (raw === this.cachedRaw) return this.cachedAllowed;
    this.cachedRaw = raw;
    this.cachedAllowed = new Set(
      raw
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
    );
    return this.cachedAllowed;
  }

  /**
   * Returns the caller's email. JWT fast-path reads `request.user.sub`
   * (attached by Passport's JwtStrategy); otherwise falls back to a
   * SystemUser lookup by id, memoized in a short-TTL cache so repeated
   * admin-route hits from the same API key amortize the DB cost.
   */
  private async lookupEmail(
    context: ExecutionContext,
    userId: number,
  ): Promise<string | null> {
    const req = context.switchToHttp().getRequest<{ user?: { sub?: string } }>();
    const fromJwt = req?.user?.sub;
    if (typeof fromJwt === 'string' && fromJwt.length > 0) {
      return fromJwt;
    }

    const now = Date.now();
    const cached = this.emailCache.get(userId);
    if (cached && now - cached.fetchedAt < USER_EMAIL_CACHE_TTL_MS) {
      return cached.email;
    }

    const user = await this.systemUserModel.query().findById(userId);
    const email = user?.email ?? null;

    if (email) {
      // Evict oldest entry past the soft cap. Insertion order in Map
      // approximates LRU well enough for a 128-entry cache.
      if (this.emailCache.size >= USER_EMAIL_CACHE_MAX) {
        const oldestKey = this.emailCache.keys().next().value;
        if (oldestKey !== undefined) this.emailCache.delete(oldestKey);
      }
      this.emailCache.set(userId, { email, fetchedAt: now });
    }
    return email;
  }
}
