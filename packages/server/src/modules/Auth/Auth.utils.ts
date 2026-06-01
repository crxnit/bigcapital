import * as bcrypt from 'bcrypt';
import { AuthApiKeyPrefix } from './Auth.constants';

export const hashPassword = (password: string): Promise<string> =>
  // Promise form propagates bcrypt errors — the callback form swallowed them
  // and resolved `undefined`, persisting a null/empty password hash.
  bcrypt.hash(password, 10);

/**
 * Extracts and validates an API key from the Authorization header
 * @param {string} authorization - Full authorization header content.
 */
export const getAuthApiKey = (authorization: string) => {
  const apiKey = authorization.toLowerCase().replace('bearer ', '').trim();
  return apiKey.startsWith(AuthApiKeyPrefix) ? apiKey : '';
};
