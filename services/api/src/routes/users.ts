import type { UserProfile } from '@premiumpass/api-contracts';
import type { Hono } from 'hono';
import { type AppEnv, requireScopes } from '../auth.js';
import type { UserStore } from '../users.js';

export function registerUsersRoutes(app: Hono<AppEnv>, users: UserStore) {
  app.get('/v1/me', requireScopes('read:me'), async (c) => {
    return c.json(
      (await users.getOrCreate(c.get('auth'))) satisfies UserProfile,
    );
  });
}
