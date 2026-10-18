# Subscription worker

Processes subscription jobs from Amazon SQS in AWS or ElasticMQ locally. Webhooks,
purchase synchronization, and reconciliation enqueue work; the worker verifies
current provider state and ownership before updating subscriptions and access.
It runs in the background without an HTTP framework.

This service is thin on purpose: it receives jobs and hands them to the
processors in [subscription processing](../../packages/subscription-processing/README.md),
where provider adapters and the atomic commit live. It also hosts the cloud
reconciliation entry, which only discovers work and queues jobs.

| Entry                                   | Responsibility                                                          |
| --------------------------------------- | ----------------------------------------------------------------------- |
| `src/local.ts`                          | Local polling, acknowledgement, retries, and graceful shutdown          |
| `src/lambda.ts`                         | SQS Lambda partial-batch responses                                      |
| `src/config.ts`                         | Validate database and queue configuration                               |
| `src/runtime.ts`                        | Reuse connections, select providers, and safely log processing outcomes |
| `src/reconciliation/lambda.ts`          | Cloud schedule/manual handler and queue acceptance                      |
| `src/reconciliation/run.ts`, `*-run.ts` | Shared preview, queue acceptance, and partial failures                  |

## How a job is processed

1. `local.ts` (ElasticMQ) or `lambda.ts` (SQS) receives a message.
2. `runtime.ts` validates it and picks the processor for its provider. Only
   that provider's credentials are loaded, so a misconfigured provider cannot
   block the others.
3. The processor verifies and commits. On success the message is acknowledged;
   on failure it becomes visible again and, after five attempts, lands in the DLQ.

## Run and configure

- `pnpm dev` includes the worker; `pnpm dev:worker` runs it alone. Settings:
  [configuration map](../../docs/GETTING_STARTED.md#5-connect-the-configuration).
  No Auth0 settings or webhook secrets are needed.
- Mock and expiration jobs need no provider credentials and are rejected in AWS.
- In AWS, provider keys come from Secrets Manager and are cached for five
  minutes. Only the worker reads Apple/Google private keys
  ([Apple](../../docs/APPLE_PURCHASES.md#aws-notification-processing),
  [Google](../../docs/GOOGLE_PLAY.md#aws-notification-processing)).
- Cloud discovery never writes to the database; see
  [Cloud reconciliation](../../docs/RECONCILIATION.md#cloud-reconciliation).
- A build emits `local.js`, `lambda.js`, and `reconciliation/lambda.js` into a clean `dist/`.

Processing guarantees: [Payments](../../docs/PAYMENTS.md#processing-and-retries).
