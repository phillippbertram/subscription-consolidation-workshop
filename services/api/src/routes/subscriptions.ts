import type {
  SubscriptionOverview,
  Entitlements,
} from '@premiumpass/api-contracts';
import type { Hono } from 'hono';
import { type AppEnv, requireScopes } from '../auth.js';
import type { UserStore } from '../users.js';
import {
  deriveEntitlements,
  type SubscriptionStore,
} from '@premiumpass/domain';

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
    const [subscriptions, adminGrant] = await Promise.all([
      subscriptionStore.listForUser(user.userId),
      subscriptionStore.getAdminGrant(user.userId),
    ]);
    return c.json({
      subscriptions,
      entitlements: deriveEntitlements(subscriptions, now(), adminGrant),
    } satisfies SubscriptionOverview);
  });
  app.get('/v1/me/entitlements', requireScopes('read:me'), async (c) => {
    const user = await users.getOrCreate(c.get('auth'));
    const [subscriptions, adminGrant] = await Promise.all([
      subscriptionStore.listForUser(user.userId),
      subscriptionStore.getAdminGrant(user.userId),
    ]);
    // Sample time after the read: a persisted Premium snapshot may have expired
    // without a webhook. Enforce that boundary again on every API request.
    return c.json(
      deriveEntitlements(
        subscriptions,
        now(),
        adminGrant,
      ) satisfies Entitlements,
    );
  });
}
