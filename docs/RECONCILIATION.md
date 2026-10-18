# Reconciliation and expiration

Reconciliation repairs missed subscription updates by checking provider state
again. Expiration applies already-verified access boundaries even when no new
notification arrives. Both use the existing subscription worker.

## At a glance

| Aspect         | Behavior                                                                                  |
| -------------- | ----------------------------------------------------------------------------------------- |
| Trigger        | Manual run, or immediately and then every five minutes with the local watcher             |
| Profiles       | All existing local profiles, or one internal user UUID                                    |
| Local services | DynamoDB Local and ElasticMQ; Stripe test / Apple Sandbox remain external services        |
| Completion     | Queue acceptance means work is pending; wait for worker completion and refresh the client |
| Access         | The API independently checks stored subscription boundaries against the current time      |

For startup, preview, provider selection, and stopping the watcher, follow
[local commands](DEVELOPMENT.md#local-reconciliation-and-expiration).
Implementation status and verification evidence live only in
[P09](TASKS.md#p09-reconciliation-and-expiration).

## What can be repaired?

| Path          | Discovery and repair                                                                                       | Prerequisite or boundary                                                                                              |
| ------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Stripe test   | Recheck stored subscriptions and discover missing ones through the mapped customer's subscriptions         | Customer mapping must already exist; reads do not change Stripe contracts                                             |
| Apple Sandbox | Refresh stored `Sandbox:<originalTransactionId>` lineages from current signed transaction and renewal data | Requires the worker's Apple settings/key; an unknown initial purchase needs purchase/Restore or a signed notification |
| Google mock   | Compare independent synthetic provider state with derived subscription records                             | Only managed `mock_google_…` records; no real Google Play billing                                                     |
| Expiration    | Recompute due entitlement snapshots from stored verified boundaries                                        | Included with every provider selection; needs no provider credentials                                                 |

Provider credentials load only for relevant work. Profiles without known Apple
subscriptions need no Apple key. Mock and expiration work need neither provider's
credentials. See [Stripe setup](GETTING_STARTED.md#5-connect-the-configuration)
and [Apple setup](APPLE_PURCHASES.md#enable-local-processing).

## Processing flow

1. **Discover work.** Paginate profiles and subscription references. Stripe
   finishes listing the mapped customer's subscriptions before sending that
   user's Stripe jobs. Apple and Google also read current source state during
   discovery.
2. **Preview or enqueue.** Preview reports differences without database writes,
   queue sends, or Apple finish. A normal run sends valid references, including
   unchanged subscriptions so the worker can check them again at processing time.
3. **Verify and commit.** The worker loads the aggregate revision before fresh
   provider state, verifies ownership, and atomically saves the subscription,
   all-provider access, completion marker, and any domain-change outbox event.
   Expiration jobs use stored boundaries instead of a provider request.
4. **Complete delivery.** Apple finishes the verified transaction after commit
   and records `finishedAt` before queue acknowledgement. Outbox publication is a
   separate path tracked in P08; access does not wait for an event consumer.

The queue payload never proves a purchase or grants access. Internal refresh
schemas remain separate from notification/client ingress. Local Apple
reconciliation, Google mock, and expiration jobs are rejected by cloud workers.

## Follow a run

Match the runner's `runId` with the worker's `correlationId`.
Provider rows use `reconciliation.stripe`, `reconciliation.apple`, or
`reconciliation.google_mock`; due snapshots use `reconciliation.expiration_due`.

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

| Entry                                                                        | Responsibility                                                       |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| [Runner](../services/subscription-worker/scripts/reconcile.ts)               | CLI, provider selection, five-minute loop, shutdown                  |
| [Discovery](../services/subscription-worker/src/reconciliation/local-run.ts) | Local profile scan, provider discovery, preview and queue acceptance |
| [Worker](../services/subscription-worker/src/runtime.ts)                     | Provider selection, fresh verification and existing processing paths |

The local runner creates no AWS schedule. Cloud scheduling and live provider /
device / latency evidence remain tracked separately in P09.
