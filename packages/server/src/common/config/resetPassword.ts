import { registerAs } from '@nestjs/config';

/**
 * Password-reset-token TTL, in seconds. Default 1 hour.
 *
 * The `AuthResetPasswordService` was reading `resetPasswordSeconds` from
 * config but no provider supplied it, so `diff > undefined` was always
 * false and tokens effectively never expired. Registering it here fixes
 * that silent failure and also feeds the cleanup cron.
 */
export default registerAs(
  'resetPasswordSeconds',
  () => (parseInt(process.env.RESET_PASSWORD_SECONDS, 10) || 60 * 60) as any,
);
