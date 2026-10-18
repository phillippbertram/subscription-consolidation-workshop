import type { ScoreHistory } from '@premiumpass/api-contracts';
import type { Hono } from 'hono';
import type { SubscriptionStore } from '@premiumpass/domain';
import { loadCurrentAccess } from '../access.js';
import { type AppEnv, requireScopes } from '../auth.js';
import type { UserStore } from '../users.js';

export function registerPremiumRoutes(
  app: Hono<AppEnv>,
  users: UserStore,
  subscriptionStore: SubscriptionStore,
  now: () => Date,
) {
  app.get(
    '/v1/premium/score-history',
    requireScopes('read:premium'),
    async (c) => {
      const user = await users.getOrCreate(c.get('auth'));
      const { entitlements } = await loadCurrentAccess(
        subscriptionStore,
        user.userId,
        now,
      );
      // Scope permits calling the API; an entitlement proves current product
      // access. A valid JWT with read:premium alone is not a paid subscription.
      if (!entitlements.features.includes('score_history')) {
        return c.json(
          {
            error: { code: 'premium_required', requestId: c.get('requestId') },
          },
          403,
        );
      }

      return c.json({
        synthetic: true,
        points: [
          { date: '2026-08-01', score: 91 },
          { date: '2026-09-01', score: 93 },
          { date: '2026-10-01', score: 94 },
        ],
      } satisfies ScoreHistory);
    },
  );
}
