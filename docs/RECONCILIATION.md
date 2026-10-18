# Reconciliation and expiration

Reconciliation repairs missed subscription updates by checking provider state
again. Expiration applies already-verified access boundaries even when no new
notification arrives. Both use the existing subscription worker.

## At a glance

| Aspect         | Behavior                                                                                                        |
| -------------- | --------------------------------------------------------------------------------------------------------------- |
| Trigger        | Local manual/watcher runs; optional five-minute AWS Google rule and IAM-authorized manual invocation            |
| Discovery      | Local profiles/subscriptions; cloud Google uses known package-scoped token-owner records                        |
| Local services | DynamoDB Local and ElasticMQ; Stripe test / Apple Sandbox / Google Play test purchases remain external services |
| Completion     | Queue acceptance means work is pending; wait for worker completion and refresh the client                       |
| Access         | The API independently checks stored subscription boundaries against the current time                            |

For startup, preview, provider selection, and stopping the watcher, follow
[local commands](DEVELOPMENT.md#local-reconciliation-and-expiration).
Implementation status and verification evidence live only in
[P09](TASKS.md#p09-reconciliation-and-expiration).

## What can be repaired?

| Path             | Discovery and repair                                                                                       | Prerequisite or boundary                                                                                              |
| ---------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Stripe test      | Recheck stored subscriptions and discover missing ones through the mapped customer's subscriptions         | Customer mapping must already exist; reads do not change Stripe contracts                                             |
| Apple Sandbox    | Refresh stored `Sandbox:<originalTransactionId>` lineages from current signed transaction and renewal data | Requires the worker's Apple settings/key; an unknown initial purchase needs purchase/Restore or a signed notification |
| Google mock      | Compare independent synthetic provider state with derived subscription records                             | Only managed `mock_google_…` records; no real Google Play billing                                                     |
| Google Play test | Refresh stored token references using current Developer API state                                          | Worker Google settings/key required; unknown first purchases need sync/Restore or RTDN                                |
| Expiration       | Recompute due entitlement snapshots from stored verified boundaries                                        | Included with every provider selection; needs no provider credentials                                                 |

Provider credentials load only for relevant work. Profiles without known Apple
subscriptions need no Apple key. Mock and expiration work need neither provider's
credentials. See [Stripe setup](GETTING_STARTED.md#5-connect-the-configuration)
and [Apple setup](APPLE_PURCHASES.md#enable-local-processing), or
[Google Play setup](GOOGLE_PLAY.md#7-enable-local-processing). Google credentials
are loaded only when known Google subscriptions need refresh.

## Processing flow

1. **Discover work.** Local runs paginate profiles and subscription references. Stripe
   finishes listing the mapped customer's subscriptions before sending that
   user's Stripe jobs. Apple and Google also read current source state during
   discovery. Cloud Google discovery only reads known references; it leaves all
   provider reads to the worker.
2. **Preview or enqueue.** Preview reports differences without database writes,
   queue sends, Apple finish, or Google acknowledgement. Cloud preview lists
   references without provider reads. A normal run sends valid references, including
   unchanged subscriptions so the worker can check them again at processing time.
3. **Verify and commit.** The worker loads the aggregate revision before fresh
   provider state, verifies ownership, and atomically saves the subscription,
   all-provider access, completion marker, and any domain-change outbox event.
   Expiration jobs use stored boundaries instead of a provider request.
4. **Complete delivery.** Apple finishes the verified transaction after commit
   and records `finishedAt` before queue acknowledgement. Google acknowledges the
   committed token and records `completedAt` before queue acknowledgement. Outbox publication runs
   separately; access does not wait for an event consumer.

The queue payload never proves a purchase or grants access. Internal refresh
schemas remain separate from notification/client ingress. Local Apple
reconciliation, Google mock, and expiration jobs are rejected by cloud workers.
Enabled cloud workers can process real Google license-test refresh jobs through
the shared verification path. Cloud Google discovery and scheduling are described
below; local Stripe/Apple/mock/expiration discovery remains separate.

## Cloud Google reconciliation

The CDK stack prepares an EventBridge rule every five minutes and a dedicated
discovery Lambda in the worker workspace. `GoogleEnabled=false` keeps the rule
disabled; the existing Google opt-in enables the API, worker, and schedule together.
No HTTP route or Auth0 scope is added. Manual invocation uses AWS IAM.

1. Discovery scans the small demo table in pages of 100 evaluated items, including
   empty filtered pages. It selects only `PROVIDER#google#SUB#<package>:…` / `OWNER`
   records for the configured package and validates owner UUID, token, and digest.
2. It enqueues a Google `reconciliation` job per valid reference. It does not call
   Google or compare provider state. The worker performs fresh test-purchase,
   product/base-plan, owner, and expiry verification before the existing atomic
   commit and acknowledgement path.
3. The scheduled event's UUID is the `runId` / `correlationId`. Repeated delivery
   reuses each token's event ID; a later tick has a new ID and can check new state.
   Queue acceptance is not worker completion. Unknown first purchases still need
   purchase/Restore or RTDN; there is no Google-wide purchase discovery.

Discovery has conditional table `Scan` and work-queue `SendMessage` permissions,
plus logging/failure-delivery permissions. It has no database writes, provider key,
or Secrets Manager access. A scan's filter/projection is a code boundary, not a
partition-level IAM restriction. It reads across the table and consumes capacity
for evaluated items. This deliberate small-demo design needs an indexed, resumable
discovery path before a larger dataset is supported.

The Lambda has a 60-second timeout and reserved concurrency 1. It stops starting
new reads/sends with less than ten seconds remaining. Storage failures, invalid
references, unconfirmed queue sends, and partial failures fail the invocation;
other valid references can still be queued. Retrying starts the scan from the
beginning with the same scheduled ID. There is no durable scan cursor: a table
that cannot fit in one invocation will repeatedly fail and needs the discovery
design changed, rather than being treated as successfully reconciled.

EventBridge target delivery and asynchronous Lambda execution each allow two
retries with a one-hour event age. Both retain exhausted failures in the separate
`GoogleReconciliationDlqUrl`: EventBridge messages represent delivery failure;
Lambda destinations include an invocation envelope and `requestPayload`. Worker
job failures continue through the existing subscription work queue/DLQ. These are
[separate AWS failure stages](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-rule-retry-policy.html),
with [Lambda execution retries configured independently](https://docs.aws.amazon.com/lambda/latest/dg/invocation-async-configuring.html).

For a future authorized deployment, function/rule/queue outputs and an IAM-authorized
manual preview are documented in [AWS verification](../infra/README.md#google-reconciliation).
`dryRun=true` lists references only, with zero queue sends, database writes, Google
reads, or purchase acknowledgements. It does not predict provider discrepancies.
Logs expose run IDs, counts, owner UUIDs, and hashed subscription references, never
purchase tokens. Cloud traces, Google lifecycle repair, and measured seven-minute
latency still require separate evidence in [P09](TASKS.md#p09-reconciliation-and-expiration)
and [P12](TASKS.md#p12-google-play-test-purchases).

## Follow a run

Match the runner's `runId` with the worker's `correlationId`.
Provider rows use `reconciliation.stripe`, `reconciliation.apple`, or
`reconciliation.google`, or `reconciliation.google_mock`; due snapshots use `reconciliation.expiration_due`.

| Result or log                                         | Meaning and next action                                                       |
| ----------------------------------------------------- | ----------------------------------------------------------------------------- |
| `would update` / `would create`                       | Preview found a difference; nothing has been repaired yet                     |
| `unchanged`                                           | Preview found no domain change                                                |
| `queued`                                              | Transport accepted work; look for `subscription.processed` in the worker      |
| `subscription.processed`                              | Worker completed this job; refresh Web/Mobile to inspect access               |
| `reconciliation.failed` / `reconciliation.run_failed` | Check configuration, provider availability, and local services; retry the run |
| `subscription.failed` / `queue.retry`                 | Worker did not acknowledge the job; queue retry/DLQ rules apply               |

A single-pass runner exits nonzero for partial failure. Other subscriptions,
users, and providers can still succeed. The watcher logs failures and continues;
stop it with `Ctrl+C`. Its own runs do not overlap, but a stopped process,
provider outage, queue backlog, or ElasticMQ restart can delay repair.

## Recovery guarantees

- **Duplicates:** a run uses stable per-subscription event IDs. Later runs get
  new IDs and can reverify; unchanged state produces no second domain-change
  event. Record layouts belong to the [data model](DYNAMODB_DATA_MODEL.md#local-reconciliation-records).
- **Provider failures:** missing, invalid, or unavailable state never means
  deletion or an extra access period. Existing verified limits remain in force.
- **Concurrent changes:** revision conflicts reload and recompute. Ending one
  subscription preserves other valid grants under the [access policy](PAYMENTS.md#access-policy).
- **Apple finish retries:** a committed job retains the exact verified finish
  target. Redelivery resumes finish without repeating domain/outbox writes.
  See [Apple recovery](APPLE_PURCHASES.md#processing-and-ownership).
- **Expiration:** recalculate a due snapshot without rewriting provider status,
  extending access, or deleting subscriptions. The API enforces expiry even
  while the watcher is stopped. A provider refresh crossing that boundary also
  emits the required outbox change.

## Exercises and code

Start with the [missed Google event exercise (T20)](DEVELOPMENT.md#exercise-a-missed-google-mock-event-t20)
and [missed initial Stripe webhook prerequisites (T21)](DEVELOPMENT.md#local-reconciliation-and-expiration).
For Apple configuration and a targeted refresh, use
[local Apple reconciliation](APPLE_PURCHASES.md#local-reconciliation).

| Entry                                                                                                  | Responsibility                                                              |
| ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| [Runner](../apps/cli/scripts/reconcile.ts)                                         | CLI, provider selection, five-minute loop, shutdown                         |
| [Discovery](../apps/cli/src/reconciliation/local-run.ts)                           | Local profile scan, provider discovery, preview and queue acceptance        |
| [Cloud Google entry](../services/subscription-worker/src/reconciliation/google-lambda.ts)              | Schedule/manual event validation, cloud clients, time budget, safe failures |
| [Cloud Google discovery](../services/subscription-worker/src/reconciliation/google-run.ts)             | Stable run/job IDs, preview, queue acceptance and partial failure           |
| [Google reference store](../packages/subscription-processing/src/providers/google/reconciliation-store.ts) | Paginated owner-reference discovery and token/digest validation             |
| [Worker](../services/subscription-worker/src/runtime.ts)                                               | Provider selection, fresh verification and existing processing paths        |

The local runner creates no AWS schedule. Only the opt-in CDK Google path prepares
cloud scheduling; it does not imply deployment or live provider/device evidence.
