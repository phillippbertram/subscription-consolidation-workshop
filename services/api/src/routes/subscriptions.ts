import type {
  SubscriptionOverview,
  Entitlements,
} from '@premiumpass/api-contracts';
import type { Hono } from 'hono';
import type { SubscriptionStore } from '@premiumpass/domain';
import { loadCurrentAccess } from '../access.js';
import { type AppEnv, requireScopes } from '../auth.js';
import type { UserStore } from '../users.js';

export function registerSubscriptionsRoutes(
  app: Hono<AppEnv>,
  users: UserStore,
  subscriptionStore: SubscriptionStore,
  now: () => Date,
) {
  app.get('/v1/me/subscriptions', requireScopes('read:me'), async (c) => {
    // Ownership starts with the verified issuer/subject. A client-supplied userId
    // must never select another user's partition.
    const user = await users.getOrCreate(c.get('auth'));
    const access = await loadCurrentAccess(subscriptionStore, user.userId, now);
    return c.json(access satisfies SubscriptionOverview);
  });

  app.get('/v1/me/entitlements', requireScopes('read:me'), async (c) => {
    const user = await users.getOrCreate(c.get('auth'));
    const { entitlements } = await loadCurrentAccess(
      subscriptionStore,
      user.userId,
      now,
    );
    return c.json(entitlements satisfies Entitlements);
  });
}
