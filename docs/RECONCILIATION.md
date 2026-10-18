# Reconciliation and expiration

Reconciliation repairs missed subscription updates by checking provider state
again. Expiration applies already-verified access boundaries even when no new
notification arrives. Both use the existing subscription worker.

## At a glance

| Aspect         | Behavior                                                                                                        |
| -------------- | --------------------------------------------------------------------------------------------------------------- |
| Trigger        | Local manual/watcher runs; optional shared five-minute AWS rule and IAM-authorized manual invocation            |
| Discovery      | Local profiles/subscriptions; cloud uses mapped Stripe customers and known Apple/Google owner records           |
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
   user's Stripe jobs. Local Apple and Google runs also read current source state during
   discovery. Cloud Stripe discovery lists customer subscriptions; cloud Apple
   and Google discovery leave all provider reads to the worker.
2. **Preview or enqueue.** Preview reports differences without database writes,
   queue sends, Apple finish, or Google acknowledgement. Cloud preview lists refresh jobs; only Stripe needs provider listing reads. A normal run sends valid references, including
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
schemas remain separate from notification/client ingress. Cloud workers accept
Stripe test, Apple Sandbox, and Google Play test refresh jobs through the same
verification paths. Google mock and expiration jobs remain local-only.

## Cloud reconciliation

One EventBridge rule runs every five minutes with three independently enabled
Lambda targets. Separate invocations isolate each provider's timeout and retries.
The schedule stays disabled while all three switches are false. Enabling a
provider's purchase processing does not automatically enable its reconciliation.
No HTTP route or Auth0 scope is added; manual invocation uses AWS IAM.

| Environment switch (default `false`) | CloudFormation parameter      | Additional requirement                           |
| ------------------------------------ | ----------------------------- | ------------------------------------------------ |
| `RECONCILIATION_STRIPE_ENABLED`      | `ReconciliationStripeEnabled` | Existing Stripe test secret/customer mappings    |
| `RECONCILIATION_APPLE_ENABLED`       | `ReconciliationAppleEnabled`  | `APPLE_ENABLED=true` and configured worker       |
| `RECONCILIATION_GOOGLE_ENABLED`      | `ReconciliationGoogleEnabled` | `GOOGLE_PLAY_ENABLED=true` and configured worker |

Disabled providers are removed from the rule's targets, receive no discovery
policy, and return `disabled` on manual invocation before reading state or keys.
The deploy wrapper and CloudFormation rules reject Apple/Google reconciliation
without the corresponding provider enabled. Each Lambda has fixed
`RECONCILIATION_PROVIDER` and `RECONCILIATION_ENABLED` settings; the event cannot
select or enable another provider.

| Provider         | Discovery and cloud preview                                                                                                                                                                        | Additional discovery permissions                                                      |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Stripe test      | Scan completed `USER#…` / `CUSTOMER#stripe` mappings; verify both mapping directions, load stored subscriptions, fully list the mapped customer's Stripe subscriptions, and queue the union of IDs | `GetItem` / `Query` on user/customer key families and the existing Stripe test secret |
| Apple Sandbox    | Scan `PROVIDER#apple#SUB#Sandbox:…` / `OWNER`; validate owner UUID and original transaction ID                                                                                                     | None; no Apple API or private key                                                     |
| Google Play test | Scan package-scoped `PROVIDER#google#SUB#<package>:…` / `OWNER`; validate owner UUID, package, token, and digest                                                                                   | None; no Google API or service-account key                                            |

All discovery roles have conditional table `Scan`, work-queue `SendMessage`, and
logging/failure-delivery permissions, with no database writes. Stripe uses only
subscription-list API reads, including in preview; it never modifies contracts.
Apple/Google discovery has no Secrets Manager access. Fresh provider verification,
atomic access/completion/outbox writes, Apple finish, and Google acknowledgement
remain in the existing worker.

Stripe can recover a missed initial webhook only after customer mapping exists.
Apple and Google refresh previously verified owner references; unknown initial
purchases still need purchase/Restore or a signed notification/RTDN. Apple uses the
original transaction ID to fetch current signed state, then finishes the exact
verified transaction after commit. Missing, partial, or unavailable provider
state never deletes a subscription or adds access.

The scheduled event UUID is `runId` / `correlationId`, shared across enabled
providers. Each provider builds stable per-subscription event IDs for redelivery;
a later tick gets a new ID to verify new state. Provider marker namespaces keep
these jobs distinct. Queue acceptance means pending work, not worker completion.

Each Lambda has a 60-second timeout and reserved concurrency 1. Scans paginate
100 evaluated items, including empty filtered pages. With less than ten seconds
remaining, the run stops starting reads/sends and fails. Invalid references,
unconfirmed sends, and partial failures fail that provider invocation while
other valid references can still queue. A Stripe customer's full listing must
pass test-mode and ownership checks before any of its jobs queue; other
customers can still succeed.

Retry starts discovery from the beginning with the same event ID. This deliberate
small-demo design has no durable cursor or secondary index. A scan filter is not
an IAM partition boundary and consumes capacity for all evaluated items. A table
or Stripe listing that cannot fit one invocation needs indexed/resumable discovery
before it can be supported; a repeated timeout is not successful reconciliation.

EventBridge delivery and asynchronous Lambda execution each allow two retries
with a one-hour event age. Both retain exhausted failures in the shared
`ReconciliationDlqUrl`. Delivery failures include target metadata; execution
failures use an invocation envelope with `requestPayload` and function ARN.
Replay only the affected provider's function with the original event ID. Worker
job failures continue through the separate subscription work queue/DLQ. These are
[separate AWS failure stages](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-rule-retry-policy.html),
with [Lambda execution retries configured independently](https://docs.aws.amazon.com/lambda/latest/dg/invocation-async-configuring.html).

For outputs, manual preview, and stopping discovery, see
[AWS verification](../infra/README.md#cloud-reconciliation). `dryRun=true` reports
refresh jobs with no sends, database writes, Apple finish, or Google acknowledgement.
It does not predict provider discrepancies. Only Stripe listing reads an external
provider. Logs contain provider/run IDs, counts, user UUIDs, and reference IDs
(Google digests), never purchase tokens, keys, or raw SDK errors.
Live AWS delivery/IAM and real store lifecycle repair remain separate evidence in
[P09](TASKS.md#p09-reconciliation-and-expiration) and
[P12](TASKS.md#p12-google-play-test-purchases).

## Follow a run

Match the runner's `runId` with the worker's `correlationId`.
Local provider rows use `reconciliation.stripe`, `reconciliation.apple`, or
`reconciliation.google`, or `reconciliation.google_mock`; due snapshots use `reconciliation.expiration_due`.
Cloud logs use `reconciliation.reference` / `reconciliation.completed` and an explicit
`provider` field.

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

| Entry                                                                                                      | Responsibility                                                              |
| ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| [Runner](../apps/cli/src/reconciliation/run.ts)                                                            | CLI, provider selection, five-minute loop, shutdown                         |
| [Discovery](../apps/cli/src/reconciliation/local-run.ts)                                                   | Local profile scan, provider discovery, preview and queue acceptance        |
| [Cloud entry](../services/subscription-worker/src/reconciliation/lambda.ts)                                | Schedule/manual event validation, cloud clients, time budget, safe failures |
| [Cloud runner](../services/subscription-worker/src/reconciliation/run.ts)                                  | Shared preview, queue acceptance and partial failure                        |
| [Stripe discovery](../packages/subscription-processing/src/providers/stripe/discovery.ts)                  | Customer mappings and shared read-only subscription listing                 |
| [Apple discovery](../packages/subscription-processing/src/providers/apple/reconciliation-store.ts)         | Known Sandbox owner lineages                                                |
| [Google reference store](../packages/subscription-processing/src/providers/google/reconciliation-store.ts) | Paginated owner-reference discovery and token/digest validation             |
| [Worker](../services/subscription-worker/src/runtime.ts)                                                   | Provider selection, fresh verification and existing processing paths        |

The local runner creates no AWS schedule. The opt-in CDK rule prepares cloud
scheduling for Stripe, Apple, and Google; it does not imply deployment or live
provider/device evidence.
