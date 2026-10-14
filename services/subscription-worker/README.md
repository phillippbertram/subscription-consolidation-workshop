# Subscription worker

Consumes billing jobs, verifies current provider state and ownership, then commits
subscriptions, all-provider access, completion markers, and pending outbox changes
atomically. It has no HTTP framework. [Processing rules](../../docs/PAYMENTS.md#processing-and-retries).

| Entry                                     | Responsibility                                               |
| ----------------------------------------- | ------------------------------------------------------------ |
| `src/local.ts`, `src/lambda.ts`           | Local polling / SQS partial-batch handler                    |
| `src/config.ts`, `src/runtime.ts`         | Validate configuration and compose clients/processors        |
| `src/apple-credentials.ts`                | Local key / cached cloud Apple credentials                   |
| `src/processing/`                         | Provider reads, normalization, idempotency and transactions  |
| `scripts/subscription-cli.ts`, `src/cli/` | CLI lifecycle, commands, prompts and presentation            |
| `src/local-admin/`                        | Fixed local database edits, seeding and reconciliation setup |
| `src/reconciliation/stripe.ts`            | Reusable Stripe discovery through the existing processor     |

`pnpm dev:worker` runs individually; `pnpm dev` includes it. Follow the
[configuration map](../../docs/GETTING_STARTED.md#5-connect-the-configuration).
No Auth0 configuration or webhook signing secret is needed. In-flight jobs may
finish on shutdown; unacknowledged jobs become visible again after timeout.

Cloud credentials come from existing Secrets Manager references and cache for
five minutes. Only this service reads the Apple private key. See
[Apple AWS setup](../../docs/APPLE_PURCHASES.md#aws-notification-processing).

The [subscription CLI](../../docs/DEVELOPMENT.md#local-subscription-cli) writes
only DynamoDB Local. Reconciliation preserves other providers and reports partial
failure. Scheduled/all-user processing remains tracked in [P09](../../docs/TASKS.md#p09-reconciliation-and-expiration).
