# Architecture

PremiumPass has two paths: **authenticated reads/actions** through the API and
**provider notifications** through signature-verifying webhooks. Both meet at
subscriptions in DynamoDB. [Product overview](../README.md) · [Setup](GETTING_STARTED.md).

## Responsibilities

| Layer                       | Responsibility                                                                         | Start reading                                                                                |
| --------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Clients                     | Login, display backend access, initiate purchases                                      | [Web](../apps/web/README.md), [Mobile](../apps/mobile/README.md)                             |
| API                         | Verify Auth0 tokens/scopes, resolve user, serve profile/access, initiate local billing | [API](../services/api/README.md)                                                             |
| Webhooks                    | Verify provider signatures and enqueue references                                      | [Stripe](../services/stripe-webhook/README.md), [Apple](../services/apple-webhook/README.md) |
| Worker                      | Verify current provider state/ownership; persist atomically                            | [Worker](../services/subscription-worker/README.md)                                          |
| Outbox publisher / consumer | Publish committed snapshots; log accepted events without access writes                 | [Outbox](../services/outbox-publisher/README.md)                                             |

Hono belongs to HTTP services. Domain code receives ordinary values and a clock,
not HTTP contexts. Each executable owns its configuration and local/Lambda entry
points; services do not import other services.

## Shared packages

These libraries are imported by apps and services; they are not separate running
processes. Workspace names come from each package's `package.json`.

| Workspace package                                                           | Responsibility                                                          |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| [`@premiumpass/api-contracts`](../packages/api-contracts/README.md)         | Shared HTTP request/response schemas and types for API, Web, and Mobile |
| [`@premiumpass/billing-contracts`](../packages/billing-contracts/README.md) | Provider event allowlist and queue job schemas/types                    |
| [`@premiumpass/domain`](../packages/domain/src/subscriptions.ts)            | Subscription and access rules across providers                          |
| [`@premiumpass/persistence`](../packages/persistence/src/index.ts)          | DynamoDB subscription storage and database configuration                |
| [`@premiumpass/aws-clients`](../packages/aws-clients/README.md)             | AWS SDK client construction for local and cloud use                     |
| [`@premiumpass/apple-store`](../packages/apple-store/README.md)             | Apple Sandbox configuration, API client, and signed-data verification   |
| [`@premiumpass/logging`](../packages/logging/src/index.ts)                  | Shared structured logging and log-level configuration                   |

## Local development topology

App and service labels include their exact workspace names. Ports and Lambda
labels distinguish how the same services run locally and in AWS.

```mermaid
flowchart TB
    Web["Web :5173<br/>@premiumpass/web"] -->|"Login"| Auth0["Auth0"]
    Mobile["Mobile: Simulator / iPhone<br/>@premiumpass/mobile"] -->|"Login"| Auth0
    Stripe["Stripe test"] --> StripeCLI["Stripe CLI"]
    Apple["Apple Sandbox"] --> Ngrok["ngrok"]
    subgraph Host["Local backend"]
        API["API :3000<br/>@premiumpass/api"]
        StripeHook["Stripe webhook :3002<br/>@premiumpass/stripe-webhook"]
        AppleHook["Apple webhook :3003<br/>@premiumpass/apple-webhook"]
        Queue["ElasticMQ and DLQ"]
        Worker["Subscription worker<br/>@premiumpass/subscription-worker"]
        DB["DynamoDB Local"]
        API -->|"Read access"| DB
        API -->|"Apple sync"| Queue
        StripeHook --> Queue
        AppleHook --> Queue
        Queue --> Worker -->|"Atomic writes"| DB
        DB -->|"Pending outbox"| Publisher["Outbox publisher<br/>@premiumpass/outbox-publisher"]
        Publisher --> Events["Separate ElasticMQ event queue"] --> Consumer["Log consumer<br/>@premiumpass/outbox-publisher"]
    end
    Web -->|"Loopback"| API
    Mobile -->|"Loopback / LAN"| API
    StripeCLI --> StripeHook
    Ngrok --> AppleHook
```

Publisher and log consumer are separate processes from the same
`@premiumpass/outbox-publisher` workspace package.

`pnpm dev` starts the five app processes and Docker/table initialization.
Stripe CLI, Mobile, ngrok, the optional outbox publisher/log consumer, and the
local reconciliation watcher run separately. Apple stays disabled until
configured. API checkout and worker verification call external provider APIs.
No AWS credentials are required. Docker provides storage/queue
services; application code runs on the host. [Commands](DEVELOPMENT.md#run-and-check).

## AWS deployment topology

```mermaid
flowchart TB
    Web["Web<br/>@premiumpass/web"] -->|"Auth0 token"| Gateway
    Mobile["Mobile<br/>@premiumpass/mobile"] -->|"Auth0 token"| Gateway
    Stripe["Stripe test events"] --> Gateway
    Apple["Apple Sandbox events"] --> Gateway
    subgraph AWS["AWS development"]
        Gateway["API Gateway HTTP API"]
        API["API Lambda<br/>@premiumpass/api"]
        StripeHook["Stripe webhook Lambda<br/>@premiumpass/stripe-webhook"]
        AppleHook["Apple webhook Lambda<br/>@premiumpass/apple-webhook"]
        Queue["SQS"]
        Worker["Subscription worker Lambda<br/>@premiumpass/subscription-worker"]
        DB["DynamoDB"]
        DLQ["DLQ"]
        Secrets["Existing Secrets Manager secrets"]
        Gateway -->|"Default route"| API
        Gateway -->|"/v1/webhooks/stripe"| StripeHook
        Gateway -->|"/v1/webhooks/apple"| AppleHook
        StripeHook --> Queue
        AppleHook --> Queue
        Queue --> Worker --> DB
        API --> DB
        Queue -.->|"Repeated failures"| DLQ
        Secrets -->|"Stripe signing secret"| StripeHook
        Secrets --> Worker
    end
```

The CDK workspace [`@premiumpass/infra`](../infra/README.md) defines the AWS
resources. The backend verifies Auth0; Gateway has no JWT/Lambda authorizer.
Webhook routes verify their own signatures. Apple is disabled by default. Only
the worker reads the Apple private key; the Stripe webhook reads its signing
secret. Lambda logs go to CloudWatch.

Cloud checkout/cancellation, browser CORS, and authenticated Apple synchronization
are not fully wired. This topology shows notification processing, not complete
local/cloud feature parity. See [AWS boundaries](../infra/README.md#resources-and-boundaries)
and the sole [verification record](TASKS.md).

## Follow a feature

- [Stripe checkout and processing](PAYMENTS.md#payment-flow): payment → verified state → access.
- [Apple purchase and notifications](APPLE_PURCHASES.md): client synchronization and lifecycle events converge in the worker.
- [Reconciliation and expiration](RECONCILIATION.md): repair missed updates and apply verified access boundaries.
- [Data model](DYNAMODB_DATA_MODEL.md): ownership, aggregate revision, completion markers, and outbox.

Local outbox publication uses a separate ElasticMQ queue and log consumer. The
EventBridge adapter has no deployed bus/rule or cloud runtime wiring. Local
reconciliation enqueues Stripe, known Apple Sandbox, and Google mock refreshes
plus due expiration jobs through the subscription worker. Independent Google mock state supports
suppressed-event exercises; cloud reconciliation remains outstanding in P09.
API access and expiry checks do not depend on event publication or
consumer success.
