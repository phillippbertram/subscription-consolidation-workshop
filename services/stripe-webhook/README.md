# Stripe webhook

`@premiumpass/stripe-webhook` verifies signed Stripe events and enqueues minimal jobs. It grants no access and has no DynamoDB dependency. The event allowlist and job schema come from `@premiumpass/billing-contracts`.

| File                              | Purpose                                                           |
| --------------------------------- | ----------------------------------------------------------------- |
| `src/app.ts`                      | Raw-byte signature verification and queue acceptance before `200` |
| `src/config.ts`, `src/runtime.ts` | Queue client, signing secret and application composition          |
| `src/local.ts`                    | Hono server on loopback port 3002                                 |
| `src/lambda.ts`                   | API Gateway Lambda handler                                        |
| `scripts/stripe-listen.ts`        | Stripe CLI forwarding with the shared event allowlist             |

Copy [`.env.example`](.env.example) to `.env` only on first setup. Local runtime needs `SUBSCRIPTION_QUEUE_URL` and `STRIPE_WEBHOOK_SECRET`; it requires no Stripe API key, price, Auth0 or database settings. Existing shell variables take precedence. Lambda reads the signing field from the existing Secrets Manager secret referenced by `STRIPE_SECRET_ARN`, caching it for five minutes. The shared cloud secret still contains worker credentials; package separation does not change secret permissions.

From the repository root, `pnpm dev:webhook` starts the watcher; `pnpm stripe:listen` runs separately. `pnpm dev` includes the webhook in grouped startup. Shared package edits are watched; restart after `.env` changes. Use either grouped or individual startup on the same ports.

`pnpm --filter @premiumpass/stripe-webhook run build` produces independent `dist/local.js` and `dist/lambda.js` bundles. `pnpm --filter @premiumpass/stripe-webhook run start` runs the built local server. Lambda exports `handler` without starting an HTTP listener.

Follow [Payments](../../docs/PAYMENTS.md) for setup and manual checks, [infrastructure](../../infra/README.md) for synthesis, and [P06](../../docs/TASKS.md#p06-stripe-purchase-and-reliable-processing) for verification status.
