import type { Context, Hono } from 'hono';
import { z } from 'zod';
import {
  createDocumentClient,
  createSqsClient,
} from '@premiumpass/aws-clients';
import type { DatabaseConfig } from '@premiumpass/persistence';
import {
  DynamoDbProcessingStore,
  ProcessingError,
} from '@premiumpass/subscription-processing';
import {
  adminPremiumRequestSchema,
  adminRedriveRequestSchema,
  adminRunRequestSchema,
  type AdminPremiumResult,
  type AdminRedriveResult,
  type AdminRunResult,
  type AdminState,
} from '@premiumpass/api-contracts/admin';
import type { AppEnv } from '../auth.js';
import type { AdminConfig } from './config.js';
import { changePremium, expireUser, refreshUser } from './actions.js';
import { QueueUnavailableError, redriveWorkDlq } from './queues.js';
import { requireAdminSecret } from './secret.js';
import { loadAdminState } from './state.js';

export interface AdminRouteOptions {
  config: AdminConfig | null;
  database: DatabaseConfig;
  providers: AdminState['providers'];
  now?: () => Date;
}

/**
 * Local-only admin routes for apps/admin. Only the local server entry
 * registers them, before Auth0 authentication runs; the Lambda entry never
 * imports this module, so the deployed API has no admin surface at all.
 *
 * The routes sit under /admin, outside the /v1 CORS rule: the admin app calls
 * them through its own dev-server proxy, so no browser origin is allowed here.
 */
export function adminRoutes(options: AdminRouteOptions) {
  return (app: Hono<AppEnv>) => {
    if (!options.config) {
      // Answer clearly instead of falling through to the Auth0 check.
      app.all('/admin/*', (c) => fail(c, 'admin_disabled', 404));
      return;
    }

    const now = options.now ?? (() => new Date());
    const documentClient = createDocumentClient(options.database);
    const sqs = createSqsClient({ local: true, requestTimeout: 3_000 });
    const store = new DynamoDbProcessingStore(
      documentClient,
      options.database.tableName,
    );
    const actions = { store, sqs, providers: options.providers, now };

    app.use('/admin/*', requireAdminSecret(options.config.secret));

    app.get('/admin/state', async (c) => {
      const state = await loadAdminState(
        {
          documentClient,
          sqs,
          tableName: options.database.tableName,
          providers: options.providers,
        },
        now(),
      );
      return c.json(state satisfies AdminState);
    });

    app.post('/admin/users/:userId/premium', async (c) => {
      const userId = await existingUser(c, store);
      if (!userId) {
        return fail(c, 'user_not_found', 404);
      }

      const request = await body(c, adminPremiumRequestSchema);
      if (!request) {
        return fail(c, 'invalid_request', 400);
      }

      return handle(c, async () => {
        const result = await changePremium(actions, userId, request);
        return c.json(result satisfies AdminPremiumResult);
      });
    });

    app.post('/admin/users/:userId/refresh', async (c) => {
      const userId = await existingUser(c, store);
      if (!userId) {
        return fail(c, 'user_not_found', 404);
      }

      const request = await body(c, adminRunRequestSchema);
      if (!request) {
        return fail(c, 'invalid_request', 400);
      }

      return handle(c, async () => {
        const result = await refreshUser(actions, userId, request);
        return c.json(result satisfies AdminRunResult);
      });
    });

    app.post('/admin/users/:userId/expiration', async (c) => {
      const userId = await existingUser(c, store);
      if (!userId) {
        return fail(c, 'user_not_found', 404);
      }

      const request = await body(c, adminRunRequestSchema);
      if (!request) {
        return fail(c, 'invalid_request', 400);
      }

      return handle(c, async () => {
        const result = await expireUser(actions, userId, request);
        return c.json(result satisfies AdminRunResult);
      });
    });

    app.post('/admin/queues/work-dlq/redrive', async (c) => {
      const request = await body(c, adminRedriveRequestSchema);
      if (!request) {
        return fail(c, 'invalid_request', 400);
      }

      return handle(c, async () => {
        const result = await redriveWorkDlq(sqs, request.dryRun);
        return c.json(result satisfies AdminRedriveResult);
      });
    });

    // Unknown admin paths end here, so they never reach Auth0 authentication.
    app.all('/admin/*', (c) => fail(c, 'not_found', 404));
  };
}

type AdminContext = Context<AppEnv>;

function fail(c: AdminContext, code: string, status: 400 | 404 | 409 | 503) {
  return c.json({ error: { code, requestId: c.get('requestId') } }, status);
}

/** Only profiles created by a verified login can receive grants or jobs. */
async function existingUser(c: AdminContext, store: DynamoDbProcessingStore) {
  const userId = z.uuid().safeParse(c.req.param('userId'));
  if (!userId.success) {
    return null;
  }

  const profile = await store.get(`USER#${userId.data}`, 'PROFILE');
  return profile?.userId === userId.data ? userId.data : null;
}

async function body<T>(c: AdminContext, schema: z.ZodType<T>) {
  let value: unknown;
  try {
    value = await c.req.json();
  } catch {
    return null;
  }

  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Translate known processing outcomes into stable codes; the rest stays a 500. */
async function handle(c: AdminContext, run: () => Promise<Response>) {
  try {
    return await run();
  } catch (error) {
    if (error instanceof ProcessingError) {
      switch (error.code) {
        case 'admin_grant_user_not_found':
          return fail(c, 'user_not_found', 404);
        case 'admin_grant_expiry_not_future':
          return fail(c, 'expiry_not_future', 400);
        case 'revision_conflict':
          return fail(c, 'revision_conflict', 409);
      }
    }

    // changeAdminGrant reports a reused request ID with other arguments as a
    // plain Error. The console generates a fresh ID after every applied change.
    if (
      error instanceof Error &&
      error.message.startsWith('Request ID already used')
    ) {
      return fail(c, 'request_id_conflict', 409);
    }

    if (error instanceof QueueUnavailableError) {
      return fail(c, 'queue_unavailable', 503);
    }

    throw error;
  }
}
