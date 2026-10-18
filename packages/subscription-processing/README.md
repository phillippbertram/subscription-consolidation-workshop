# Subscription processing

Reusable backend processing used by the [worker](../../services/subscription-worker/README.md)
and [local CLI](../../apps/cli/README.md). This package owns provider verification,
processing order, ownership bindings, admin-grant commands, and atomic access/outbox writes.
Pure access rules remain in `@premiumpass/domain`.

It has no executable entry, CLI prompts, queue polling, or `.env` loading. Callers
supply configuration and database connections. Provider factories accept explicit
environment values and a local/cloud flag; cloud credential adapters retain their
bounded Secrets Manager caches.

## Public entry points

| Import suffix            | Responsibility                                                             |
| ------------------------ | -------------------------------------------------------------------------- |
| Root                     | Shared store, processing errors, expiration, and domain-state comparison   |
| `/stripe`                | Stripe factory, credentials, and provider store                            |
| `/apple`                 | Apple factory and verified provider source                                 |
| `/google`                | Google factory, verified source, and known-reference discovery store       |
| `/google-mock`           | Synthetic source state, scenarios, normalization, and factory              |
| `/reconciliation/stripe` | Stripe discovery, dry-run comparison, and direct or queued repair          |
| `/admin-grants`          | Grant/revoke processing, audit/idempotency contracts, and DynamoDB adapter |

Narrow exports keep read-only and local consumers from loading provider factories:

| Import suffix                           | Responsibility                                                                                               |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `/contracts`                            | Processing errors and aggregate/expiration contracts without persistence initialization                      |
| `/stripe/store`                         | Stripe persistence without the Stripe SDK or credential factory                                              |
| `/stripe/credentials`                   | Explicit Stripe credential loading                                                                           |
| `/apple/source`, `/google/source`       | Provider readers without worker construction                                                                 |
| `/google/discovery`, `/apple/discovery` | Known-reference reads without provider clients or completion stores                                          |
| `/stripe/discovery`                     | Customer mapping scan and read-only Stripe subscription discovery; reuses the local listing/ownership checks |

Use these exports rather than importing private `src/` paths. Keep imports that
only describe types as `import type`, so they create no runtime dependency. Each provider keeps
its existing `factory.ts`, `processor.ts`, `source.ts`, and `store.ts` together.
Stripe also owns its contracts and pure normalization. Its reconciliation store
only scans customer mappings; `discovery.ts` composes that persistence with the
credential-backed Stripe reader. The worker supplies queue delivery separately. Google mocks keep
independent source state separate from persisted access.

## Persistence and completion

`admin-grants/processor.ts` validates normalized grant/revoke requests, computes
changes, and handles previews, durable receipts, and conflict retries through an
`AdminGrantStore` contract. `store.ts` owns DynamoDB keys, audit reads/pagination,
and the transaction containing grant, receipt, access, and outbox intent. The
grant model and pure access policy remain in `@premiumpass/domain`.

Callers supply a trusted actor, stable request ID, store, and optional clock.
This package does not authorize operators. The local CLI owns OS attribution,
flag parsing, and output; any future hosted caller must authorize administration
before invoking this operation. No HTTP administration route is added.

Provider stores prepare ownership checks, subscription writes, and processing
markers. The shared [DynamoDbProcessingStore](src/processing/dynamodb-processing.ts)
uses one client/table context. `commitSubscription` replaces one subscription
while preserving other providers. `commit` adds the aggregate revision guard,
profile check, access snapshot, and optional outbox entry, then sends one DynamoDB
transaction containing every write.

Every processor runs its attempt through the shared
[`retryOnRevisionConflict`](src/processing/retry.ts) loop: skip completed events,
retry a lost compare-and-swap race with fresh reads, and rethrow anything else.
Apple and Google processors commit access before finishing or acknowledging the
purchase. A durable marker allows retries to resume provider completion without
another domain/outbox update. Completion uses a separate conditional update.
Shared change detection excludes verification timestamps/revisions and includes
due access boundaries. Expiration recomputes access without inventing provider
state or extending a grant.

CLI demo edits and expiration use the same shared transaction. Direct Stripe
reconciliation uses the same processor as queue jobs, so extracting this package
does not introduce a second implementation of payment or ownership rules.

[Payments](../../docs/PAYMENTS.md#processing-and-retries) owns behavior;
[Data model](../../docs/DYNAMODB_DATA_MODEL.md) owns keys and relationships;
[TASKS](../../docs/TASKS.md) owns verification status.
