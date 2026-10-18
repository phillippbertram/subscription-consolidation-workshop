# Subscription worker

Processes subscription jobs from Amazon SQS in AWS or ElasticMQ locally. Webhooks,
purchase synchronization, and reconciliation enqueue work; the worker verifies
current provider state and ownership before updating subscriptions and access.
It runs in the background without an HTTP framework.

The service owns transport and runtime composition. The reusable processors,
provider adapters, and atomic persistence live in
[subscription processing](../../packages/subscription-processing/README.md).
Developer commands live in the separate [CLI](../../apps/cli/README.md).
Scheduled provider discovery is another backend entry in this service: it
creates queue jobs and belongs to the same subscription-processing lifecycle.
Provider discovery adapters live in the processing package; the service owns
scheduling context, queue acceptance, and run-level failure handling.

| Entry                                   | Responsibility                                                          |
| --------------------------------------- | ----------------------------------------------------------------------- |
| `src/local.ts`                          | Local polling, acknowledgement, retries, and graceful shutdown          |
| `src/lambda.ts`                         | SQS Lambda partial-batch responses                                      |
| `src/config.ts`                         | Validate database and queue configuration                               |
| `src/runtime.ts`                        | Reuse connections, select providers, and safely log processing outcomes |
| `src/reconciliation/lambda.ts`          | Cloud schedule/manual handler and queue acceptance                      |
| `src/reconciliation/run.ts`, `*-run.ts` | Shared preview, queue acceptance, and partial failures                  |

`runtime.ts` keeps a typed provider switch and delegates construction to the
shared provider factories. Credentials load only for the selected provider.
Google's lazy source is scoped to one runtime; settings are checked on every
selection. Cloud credentials cache for five minutes; Google rebuilds its client
when credentials refresh. Local-only mock/expiration factories reject cloud jobs
before reading credentials.

Cloud discovery has no database-write permissions. Apple/Google discovery has no
provider keys; Stripe discovery reads the existing test secret and validates
customer ownership before fully listing subscriptions. Provider-specific reference
stores remain in the shared processing package. Schedule switches, preview,
failure isolation, and small-table limits belong to
[Cloud reconciliation](../../docs/RECONCILIATION.md#cloud-reconciliation).

A build cleans `dist/` and emits `local.js`, `lambda.js`, and
`reconciliation/lambda.js`; moved CLI bundles cannot survive a rebuild. Provider
runner files build strict refresh jobs with stable event IDs; the shared runner
handles preview, queue acceptance, and partial failures. Logger types come from
`@premiumpass/logging`, which owns the Pino dependency.

`pnpm dev:worker` runs individually; `pnpm dev` includes it. Follow the
[configuration map](../../docs/GETTING_STARTED.md#5-connect-the-configuration).
No Auth0 configuration or webhook signing secret is needed. Local mock/expiration
jobs need no provider credentials. In-flight jobs may finish on shutdown;
unacknowledged jobs become visible again after timeout.

Cloud credentials come from existing Secrets Manager references. Only the worker
reads Apple/Google private keys in AWS. See
[Apple AWS setup](../../docs/APPLE_PURCHASES.md#aws-notification-processing) and
[Google AWS setup](../../docs/GOOGLE_PLAY.md#aws-notification-processing).

[Payments](../../docs/PAYMENTS.md#processing-and-retries) owns processing guarantees;
[Reconciliation](../../docs/RECONCILIATION.md) owns discovery and recovery behavior.
Implementation status and verification remain in [TASKS](../../docs/TASKS.md).
