import type { Hono } from 'hono';
import { type AppEnv, requireScopes } from '../auth.js';
import type { UserStore } from '../users.js';
import { bodyLimit } from 'hono/body-limit';
import {
  checkoutRequestIdSchema,
  checkoutRequestSchema,
  cancellationRequestSchema,
  type CheckoutSession,
  type CancellationResult,
} from '@premiumpass/api-contracts';
import { CheckoutError } from '../billing/contracts.js';
import { getVerifiedCheckoutEmail } from '../billing/auth0-email.js';
import type { AuthConfig } from '../config.js';
import type { CheckoutService } from '../billing/checkout-service.js';
import type { CancellationService } from '../billing/cancellation-service.js';

export interface StripeRouteOptions {
  checkout?: CheckoutService;
  cancellation?: CancellationService;
  webOrigin?: string;
}

export function registerStripeRoutes(
  app: Hono<AppEnv>,
  authConfig: AuthConfig,
  users: UserStore,
  options: StripeRouteOptions,
) {
  app.post(
    '/v1/billing/stripe/checkout-session',
    requireScopes('write:checkout', 'openid', 'email'),
    bodyLimit({
      maxSize: 1024,
      onError: (c) =>
        c.json(
          {
            error: {
              code: 'invalid_checkout_request',
              requestId: String(c.get('requestId')),
            },
          },
          400,
        ),
    }),
    async (c) => {
      const origin = c.req.header('Origin');
      if (origin && origin !== options.webOrigin) {
        return c.json(
          {
            error: {
              code: 'origin_not_allowed',
              requestId: c.get('requestId'),
            },
          },
          403,
        );
      }

      if (!options.checkout) {
        throw new CheckoutError('checkout_unavailable', 503);
      }

      // The web client's useCheckout hook creates a UUID per purchase attempt,
      // stores it per user in sessionStorage, and reuses it for retries.
      // ApiClient.checkout (apps/web/src/api/api-client.ts) sends it in this header.
      // It is separate from the server-generated X-Request-Id for each HTTP call.
      // The backend derives Stripe's idempotency key from this attempt UUID:
      // https://docs.stripe.com/api/idempotent_requests
      const key = checkoutRequestIdSchema.safeParse(
        c.req.header('Idempotency-Key'),
      );
      // Only the plan is client input. Strict parsing rejects fields such as
      // userId, customerId, email, or price that the server must determine.
      const body = checkoutRequestSchema.safeParse(
        await c.req.json<unknown>().catch(() => null),
      );
      if (
        !key.success ||
        !body.success ||
        !c.req
          .header('Content-Type')
          ?.toLowerCase()
          .startsWith('application/json')
      ) {
        throw new CheckoutError('invalid_checkout_request', 400);
      }

      const identity = c.get('auth');
      // The validated token establishes identity; UserInfo separately supplies
      // a verified billing email for that same subject.
      const verifiedEmail = await getVerifiedCheckoutEmail(
        authConfig,
        identity,
        c.req.header('Authorization') ?? '',
      );
      const user = await users.getOrCreate(identity);
      return c.json(
        (await options.checkout.start(
          user.userId,
          key.data,
          body.data.planId,
          verifiedEmail,
        )) satisfies CheckoutSession,
      );
    },
  );

  app.post(
    '/v1/billing/stripe/cancel-subscription',
    requireScopes('read:me', 'write:checkout'),
    bodyLimit({ maxSize: 1024 }),
    async (c) => {
      const origin = c.req.header('Origin');
      if (origin && origin !== options.webOrigin) {
        throw new CheckoutError('origin_not_allowed', 403);
      }

      if (!options.cancellation) {
        throw new CheckoutError('cancellation_unavailable', 503);
      }

      const body = cancellationRequestSchema.safeParse(
        await c.req.json<unknown>().catch(() => null),
      );
      if (
        !body.success ||
        !c.req
          .header('Content-Type')
          ?.toLowerCase()
          .startsWith('application/json')
      ) {
        throw new CheckoutError('invalid_cancellation_request', 400);
      }

      const user = await users.getOrCreate(c.get('auth'));
      return c.json(
        (await options.cancellation.cancel(
          user.userId,
          body.data.subscriptionId,
        )) satisfies CancellationResult,
      );
    },
  );
}
