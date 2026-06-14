import { registerAs } from '@nestjs/config';

export default registerAs('jwt', () => {
  // This secret is the JWT signing AND verification key (Auth.module + Jwt.strategy).
  // The previous `|| '123123'` fallback was an auth-bypass: every Docker deployment
  // passes the secret as `JWT_SECRET` (not `APP_JWT_SECRET`), so the app silently
  // signed every token with the hardcoded, now-public value. Read both names
  // (prefer APP_JWT_SECRET) and FAIL FAST if neither is set — never fall back to a
  // known key.
  const secret = process.env.APP_JWT_SECRET || process.env.JWT_SECRET;

  if (!secret) {
    throw new Error(
      'JWT signing secret is not set. Set APP_JWT_SECRET (or JWT_SECRET). ' +
        'Refusing to start with an insecure default key.',
    );
  }

  return { secret };
});
