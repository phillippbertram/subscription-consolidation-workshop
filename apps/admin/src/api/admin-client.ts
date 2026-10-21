import type { z } from 'zod';
import { apiErrorSchema } from '@premiumpass/api-contracts';
import {
  adminPremiumResultSchema,
  adminRedriveResultSchema,
  adminRunResultSchema,
  adminSecretHeader,
  adminStateSchema,
  type AdminPremiumRequest,
  type AdminRunRequest,
} from '@premiumpass/api-contracts/admin';

const messages: Record<string, string> = {
  admin_secret_invalid:
    'The admin secret does not match ADMIN_SECRET of the local API. Enter it again.',
  admin_disabled:
    'Admin routes are disabled. Set ADMIN_SECRET in config/.env, run pnpm config:sync, and restart the API.',
  api_unreachable:
    'The local API does not answer. Start it with pnpm dev or pnpm dev:api.',
  user_not_found: 'This user has no profile in the local database.',
  invalid_request: 'The request was incomplete or invalid.',
  expiry_not_future: 'The expiry must be in the future.',
  request_id_conflict:
    'This request ID was already used with other values. Reload the page and try again.',
  revision_conflict:
    'Another change was committed at the same time. Preview again.',
  queue_unavailable:
    'ElasticMQ did not accept the request. Start it with pnpm local:up and retry.',
};

export class AdminApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(
      messages[code] ??
        `The request failed (${code}). Check the API log for this request.`,
    );
  }
}

/**
 * Calls the API's local admin routes through the Vite proxy (same origin).
 * The secret travels in its own header and lives only in this tab's
 * sessionStorage; it is never part of the build.
 */
export function createAdminClient(secret: string) {
  async function request<T>(
    path: string,
    schema: z.ZodType<T>,
    body?: unknown,
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetch(path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          [adminSecretHeader]: secret,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new AdminApiError('api_unreachable', 0);
    }

    const payload: unknown = await response.json().catch(() => undefined);
    if (!response.ok) {
      const error = apiErrorSchema.safeParse(payload);
      // The dev proxy answers without a JSON body when the API is down.
      throw new AdminApiError(
        error.success ? error.data.error.code : 'api_unreachable',
        response.status,
      );
    }

    return schema.parse(payload);
  }

  return {
    state: () => request('/admin/state', adminStateSchema),
    premium: (userId: string, input: AdminPremiumRequest) =>
      request(
        `/admin/users/${userId}/premium`,
        adminPremiumResultSchema,
        input,
      ),
    refresh: (userId: string, input: AdminRunRequest) =>
      request(`/admin/users/${userId}/refresh`, adminRunResultSchema, input),
    expiration: (userId: string, input: AdminRunRequest) =>
      request(`/admin/users/${userId}/expiration`, adminRunResultSchema, input),
    redrive: (dryRun: boolean) =>
      request('/admin/queues/work-dlq/redrive', adminRedriveResultSchema, {
        dryRun,
      }),
  };
}

export type AdminClient = ReturnType<typeof createAdminClient>;
