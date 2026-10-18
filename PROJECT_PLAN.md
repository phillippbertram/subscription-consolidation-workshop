# Project plan

PremiumPass is a learning project for mobile authentication and reliable
subscription processing. [README](README.md) explains the product;
[TASKS](docs/TASKS.md) records implementation status and evidence.
This document defines the intended outcome, not a claim of completion.

## Outcome and scope

Build a reproducible demo with one Premium product, two synthetic users, one AWS
development account/region, and an iOS verification platform. Web and Mobile
share server-derived access across Stripe test subscriptions, real Apple Sandbox
purchases, and a later Google mock provider.

| Learn                      | Demonstrate                                                                   |
| -------------------------- | ----------------------------------------------------------------------------- |
| Identity and authorization | Auth0 login; backend token/scope verification; stable internal users          |
| Subscriptions and access   | Provider state becomes a verified access boundary; scope alone grants nothing |
| Asynchronous processing    | Signed webhook → queue → current provider state → atomic commit               |
| Reliability                | Duplicate/delayed events, concurrency, retries, DLQ, outbox, reconciliation   |
| Reproducible operation     | Local setup, CDK, development deployment, manual evidence, cleanup            |

Production purchases/publication, real Google billing, plan changes, proration,
refund-policy design, account merging, and high availability are outside this
iteration. Android verification is optional and must not be inferred from iOS.

## Domain and architecture boundaries

[Architecture](docs/ARCHITECTURE.md) owns component diagrams;
[Payments](docs/PAYMENTS.md#access-policy) owns the access policy;
[DynamoDB](docs/DYNAMODB_DATA_MODEL.md) owns record shapes and transactions.

- Resolve identity from validated issuer/subject; never use email as ownership.
- Verify payment state and owner before granting access. Provider outages add no
  access period; existing verified access/grace limits continue to apply.
- Combine valid grants across providers and check expiry during API reads.
- Keep HTTP transport, provider adapters, persistence, and pure domain rules separate.
- Persist subscription state, aggregate revision, completion, and outbox atomically.

## Remaining target behavior

| Area                 | Intended behavior; implementation status remains in TASKS                                                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Google mock          | Separate authoritative mock state; active, renewal failure, cancellation, expiry, and event-suppression scenarios                                                                     |
| Outbox / EventBridge | Publish pending changes with stable IDs; mark only accepted entries sent; handle partial success and crash-after-send duplicates                                                      |
| Event consumer       | Trace stable event IDs; distinguish EventBridge delivery failures from asynchronous Lambda execution failures                                                                         |
| Reconciliation       | Every five minutes plus manual runs; paginate known customers/subscriptions, discover missed Stripe subscriptions, refresh Apple/Google state, enqueue through the existing processor |
| Expiration           | Reevaluate due grants; synchronous API expiry checks already protect access independently                                                                                             |

Reconciliation must not treat provider errors as deletion. A run uses stable job
IDs within that run; later runs can reverify. Record failures and discrepancies.
A Stripe customer mapping must exist before checkout so discovery can recover a
missed initial webhook. Unmapped external purchases are not automatically assigned.

## Acceptance and final demonstration

1. A new developer can follow [Getting started](docs/GETTING_STARTED.md) using
   their own service accounts, then follow [Cleanup](docs/DEVELOPMENT.md#cleanup).
2. Demonstrate login/logout, stable separate user identities, token rejection,
   scope enforcement, and backend-authoritative Premium access.
3. Complete a Stripe test purchase and Apple Sandbox purchase/restore; exercise
   cancellation, expiry, grace, ownership rejection, and overlapping grants.
4. Show duplicate/delayed/concurrent processing, a DLQ failure and redrive, outbox
   crash recovery, and repair of a suppressed event by reconciliation.
5. Verify the deployed development stack; record platform,
   date, working state, exact checks, remaining gaps, and no secrets/full tokens.

Target healthy-dependency demo latency: Premium within **30 seconds** of a
processable webhook; missed updates repaired within **seven minutes** with the
planned five-minute reconciliation schedule. These are demo targets, not SLAs.

Manual scenarios retain IDs T01–T22 and live beside their owning guides; the
[scenario index](docs/TASKS.md#manual-scenario-index) links them. No automated test
suite is planned. Code checks, local synthesis, native builds, and real provider/
AWS evidence remain separate verification layers.
