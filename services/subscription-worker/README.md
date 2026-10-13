# Subscription worker

`@premiumpass/subscription-worker` consumes billing jobs, verifies current provider state and ownership, and commits subscriptions, entitlements, completion markers and pending outbox events atomically. It has no HTTP framework or webhook handler. Queue contracts come from `@premiumpass/billing-contracts`.

| File                              | Purpose                                                               |
| --------------------------------- | --------------------------------------------------------------------- |
| `src/local.ts`                    | Local queue polling; delete messages only after successful processing |
| `src/lambda.ts`                   | SQS Lambda handler with partial batch failure reporting               |
| `src/config.ts`, `src/runtime.ts` | Queue/database clients, Stripe credentials and processor composition  |
| `src/processing/`                 | Provider reads, domain mapping, idempotency and transactional writes  |
| `scripts/seed-subscription.ts`    | Explicit local-only demo scenarios                                    |

Copy [`.env.example`](.env.example) to `.env` only on first setup. Use the BFF's local DynamoDB table/endpoint, Stripe test key and price, plus the webhook's queue URL. No webhook signing secret or Auth0 configuration is required. Existing shell variables take precedence. Local startup rejects cloud database/queue endpoints. Lambda reads the key/price fields from the existing Secrets Manager secret referenced by `STRIPE_SECRET_ARN`, caching them for five minutes.

From the repository root, `pnpm dev:worker` starts the watcher. `pnpm dev` includes it in grouped startup. Shared package edits are watched; restart after `.env` changes. On shutdown, idle polling is aborted; an in-flight job may finish. Unacknowledged jobs remain retryable. ElasticMQ messages disappear when its container stops.

`pnpm --filter @premiumpass/subscription-worker run build` produces independent `dist/local.js` and `dist/lambda.js` bundles. `pnpm --filter @premiumpass/subscription-worker run start` runs the built poller. `pnpm demo:subscription` retains its local-only scenario behavior.

Follow [Payments](../../docs/PAYMENTS.md) for setup and manual checks, [infrastructure](../../infra/README.md) for synthesis, and [P06](../../docs/TASKS.md#p06-stripe-purchase-and-reliable-processing) for verification status.
