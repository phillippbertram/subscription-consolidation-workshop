import { createHash, timingSafeEqual } from 'node:crypto';
import { createMiddleware } from 'hono/factory';
import { adminSecretHeader } from '@premiumpass/api-contracts/admin';
import type { AppEnv } from '../auth.js';

function digest(value: string) {
  return createHash('sha256').update(value, 'utf8').digest();
}

/**
 * Admin routes accept only the shared admin secret, never an Auth0 token.
 * Digests have a fixed length, so the constant-time comparison does not leak
 * the secret's length or how many leading characters matched.
 *
 * Demo simplification: one shared secret identifies no person. A hosted admin
 * would need individual admin identities and authorization per action.
 */
export function requireAdminSecret(secret: string) {
  const expected = digest(secret);
  return createMiddleware<AppEnv>(async (c, next) => {
    const provided = c.req.header(adminSecretHeader);
    if (!provided || !timingSafeEqual(digest(provided), expected)) {
      return c.json(
        {
          error: {
            code: 'admin_secret_invalid',
            requestId: c.get('requestId'),
          },
        },
        401,
      );
    }

    await next();
  });
}
