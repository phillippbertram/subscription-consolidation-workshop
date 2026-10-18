# Subscription worker

Consumes billing jobs, verifies current provider state and ownership, then commits
subscriptions, all-provider access, completion markers, and pending outbox changes
atomically. It has no HTTP framework. [Processing rules](../../docs/PAYMENTS.md#processing-and-retries).

For Apple, the worker then finishes the verified transaction and records
`finishedAt` before acknowledging the job. Retries of a committed event resume
this step without another domain/outbox write. [Apple recovery](../../docs/APPLE_PURCHASES.md#processing-and-ownership).

| Entry                                         | Responsibility                                                        |
| --------------------------------------------- | --------------------------------------------------------------------- |
| `src/local.ts`, `src/lambda.ts`               | Local polling / SQS partial-batch handler                             |
| `src/config.ts`, `src/runtime.ts`             | Validate configuration and compose clients/processors                 |
| `src/apple-credentials.ts`                    | Local key / cached cloud Apple credentials                            |
| `src/processing/`                             | Provider reads, normalization, idempotency and transactions           |
| `scripts/subscription-cli.ts`, `src/cli/`     | CLI lifecycle, commands, prompts and presentation                     |
| `src/local-admin/`                            | Fixed local database edits, seeding and reconciliation setup          |
| `scripts/reconcile.ts`, `src/reconciliation/` | Local paginated discovery, five-minute runner and provider refreshes   |
| `scripts/google-mock.ts`                      | Independent Google mock changes and optional notification suppression |
| `src/reconciliation/stripe.ts`                | Reusable Stripe discovery through the existing processor              |

`pnpm dev:worker` runs individually; `pnpm dev` includes it. Follow the
[configuration map](../../docs/GETTING_STARTED.md#5-connect-the-configuration).
No Auth0 configuration or webhook signing secret is needed. Provider credentials
are loaded only for that provider's jobs; local mock/expiration work requires
neither a Stripe key nor an Apple key. In-flight jobs may
finish on shutdown; unacknowledged jobs become visible again after timeout.

Cloud credentials come from existing Secrets Manager references and cache for
five minutes. Only this service reads the Apple private key. See
[Apple AWS setup](../../docs/APPLE_PURCHASES.md#aws-notification-processing).

The [subscription CLI](../../docs/DEVELOPMENT.md#local-subscription-cli) writes
only DynamoDB Local. The [Reconciliation guide](../../docs/RECONCILIATION.md)
explains provider discovery, expiration, and recovery through the existing worker.
For startup and scenarios, use the [local commands](../../docs/DEVELOPMENT.md#local-reconciliation-and-expiration).
`pnpm google-mock` changes independent synthetic source state; implementation
status remains in [P09](../../docs/TASKS.md#p09-reconciliation-and-expiration).
