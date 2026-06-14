import { registerAs } from '@nestjs/config';

export default registerAs('jwt', () => ({
  // This secret is the JWT signing AND verification key (Auth.module + Jwt.strategy).
  // The previous `|| '123123'` fallback was an auth-bypass: every Docker deployment
  // passes the secret as `JWT_SECRET` (not `APP_JWT_SECRET`), so the app silently
  // signed every token with the hardcoded, now-public value. Read both names
  // (prefer APP_JWT_SECRET) and never fall back to a known key.
  //
  // The presence check is NOT done here: this factory is loaded by every process
  // that builds ConfigModule, including the migration/CLI entrypoint (cli.ts),
  // which legitimately has no JWT secret in its env. The fail-fast lives in the
  // API bootstrap (main.ts) so the server that actually serves auth refuses to
  // start without a real secret, while migrations still run.
  secret: process.env.APP_JWT_SECRET || process.env.JWT_SECRET,
}));
