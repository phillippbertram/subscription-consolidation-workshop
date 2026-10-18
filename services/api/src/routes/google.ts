import type { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import {
  googleSyncRequestSchema,
  googleOperationIdSchema,
  type GoogleConfig,
  type GoogleSyncOperation,
  type GoogleSyncStatus,
} from '@premiumpass/api-contracts';
import { type AppEnv, requireScopes } from '../auth.js';
import type { UserStore } from '../users.js';
import type { GoogleBilling } from '../billing/google.js';
import { CheckoutError } from '../billing/contracts.js';

export function registerGoogleRoutes(
  app: Hono<AppEnv>,
  users: UserStore,
  google: GoogleBilling | undefined,
) {
  app.get(
    '/v1/billing/google/config',
    requireScopes('read:me', 'write:checkout'),
    async (c) => {
      if (!google) {
        throw new CheckoutError('google_unavailable', 503);
      }

      const user = await users.getOrCreate(c.get('auth'));
      return c.json({
        packageName: google.packageName,
        productId: google.productId,
        basePlanId: google.basePlanId,
        // Random internal UUID: no email or Auth0 subject is sent to the store.
        obfuscatedAccountId: user.userId,
        environment: 'test',
      } satisfies GoogleConfig);
    },
  );
  app.post(
    '/v1/billing/google/sync',
    requireScopes('write:checkout'),
    bodyLimit({
      maxSize: 8192,
      onError: (c) =>
        c.json(
          {
            error: {
              code: 'google_request_too_large',
              requestId: String(c.get('requestId')),
            },
          },
          413,
        ),
    }),
    async (c) => {
      if (!google) {
        throw new CheckoutError('google_unavailable', 503);
      }

      const input = googleSyncRequestSchema.safeParse(
        await c.req.json<unknown>().catch(() => null),
      );
      if (!input.success) {
        throw new CheckoutError('invalid_google_request', 400);
      }

      const user = await users.getOrCreate(c.get('auth'));
      const operationId = await google.enqueue(
        user.userId,
        input.data.purchaseToken,
        c.get('requestId'),
      );
      return c.json(
        { operationId, status: 'pending' } satisfies GoogleSyncOperation,
        202,
      );
    },
  );
  app.get(
    '/v1/billing/google/sync/:operationId',
    requireScopes('read:me'),
    async (c) => {
      if (!google) {
        throw new CheckoutError('google_unavailable', 503);
      }

      const id = googleOperationIdSchema.safeParse(c.req.param('operationId'));
      if (!id.success) {
        throw new CheckoutError('invalid_google_request', 400);
      }

      const user = await users.getOrCreate(c.get('auth'));
      return c.json({
        status: (await google.completed(user.userId, id.data))
          ? 'completed'
          : 'pending',
      } satisfies GoogleSyncStatus);
    },
  );
}
