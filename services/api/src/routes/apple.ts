import type { Hono } from 'hono';
import { type AppEnv, requireScopes } from '../auth.js';
import type { UserStore } from '../users.js';
import { bodyLimit } from 'hono/body-limit';
import {
  appleSyncRequestSchema,
  appleOperationIdSchema,
  type AppleConfig,
  type AppleSyncOperation,
  type AppleSyncStatus,
} from '@premiumpass/api-contracts';
import { CheckoutError } from '../billing/contracts.js';
import type { AppleBilling } from '../billing/apple.js';

export function registerAppleRoutes(
  app: Hono<AppEnv>,
  users: UserStore,
  apple: AppleBilling | undefined,
) {
  app.get(
    '/v1/billing/apple/config',
    requireScopes('read:me', 'write:checkout'),
    async (c) => {
      if (!apple) {
        throw new CheckoutError('apple_unavailable', 503);
      }

      const user = await users.getOrCreate(c.get('auth'));
      return c.json({
        productId: apple.productId,
        appAccountToken: user.userId,
        environment: 'Sandbox',
      } satisfies AppleConfig);
    },
  );
  app.post(
    '/v1/billing/apple/sync',
    requireScopes('write:checkout'),
    bodyLimit({ maxSize: 1024 }),
    async (c) => {
      if (!apple) {
        throw new CheckoutError('apple_unavailable', 503);
      }

      const input = appleSyncRequestSchema.safeParse(
        await c.req.json<unknown>().catch(() => null),
      );
      if (!input.success) {
        throw new CheckoutError('invalid_apple_request', 400);
      }

      const user = await users.getOrCreate(c.get('auth'));
      const operationId = await apple.enqueue(
        user.userId,
        input.data.transactionId,
        c.get('requestId'),
      );
      return c.json(
        { operationId, status: 'pending' } satisfies AppleSyncOperation,
        202,
      );
    },
  );
  app.get(
    '/v1/billing/apple/sync/:operationId',
    requireScopes('read:me'),
    async (c) => {
      if (!apple) {
        throw new CheckoutError('apple_unavailable', 503);
      }

      const id = appleOperationIdSchema.safeParse(c.req.param('operationId'));
      if (!id.success) {
        throw new CheckoutError('invalid_apple_request', 400);
      }

      const user = await users.getOrCreate(c.get('auth'));
      return c.json({
        status: (await apple.completed(user.userId, id.data))
          ? 'completed'
          : 'pending',
      } satisfies AppleSyncStatus);
    },
  );
}
