import { registerAs } from '@nestjs/config';

/**
 * Comma-separated list of email addresses that have system-administrator
 * access. Currently gates only `/api/system-audit-logs`. Empty list =
 * no one is admin (fail closed).
 */
export default registerAs('systemAdmin', () => ({
  emails: process.env.SYSTEM_ADMIN_EMAILS || '',
}));
