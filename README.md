# PremiumPass

PremiumPass is a hands-on subscription demo: sign in, buy a test subscription,
and unlock synthetic score history. Web and Mobile share one backend account
and the same Free/Premium access rules.

Use your own **Auth0 tenant**, **Stripe test environment**, and optionally
**Apple sandbox** and **AWS development account**. All application data is
synthetic; this project is not a production payment service.

## What happens in the demo?

1. Sign in through Auth0.
2. See your account and current access in Web or Mobile.
3. Buy through Stripe Checkout on the website or Apple Sandbox on an iPhone.
4. The backend verifies the provider's state and updates your subscription.
5. Refresh to see Premium access. Cancellation keeps access until its verified
   boundary; another valid subscription can still grant access.

A successful checkout screen is not proof of Premium access. The backend makes
that decision, including expiration checks on every protected request.

```mermaid
flowchart LR
    Clients["Web / Mobile"] -->|"Sign in"| Auth0["Auth0"]
    Clients <-->|"Requests / access"| Backend["PremiumPass backend"]
    Clients -->|"Test purchase"| Providers["Stripe / Apple Sandbox"]
    Providers <-->|"Events / verification"| Backend
    Backend --> Data["Subscriptions and access"]
```

## Start here

Follow **[Getting started](docs/GETTING_STARTED.md)** for a local website,
Auth0 login, and your first Stripe test purchase. It includes prerequisites,
configuration files, startup order, and checks after each step.

The first path needs no AWS account or Xcode. Docker runs DynamoDB Local and
ElasticMQ; the API, webhooks, worker, and website run on your computer.
Auth0 and Stripe remain real external services in development/test mode.

| You want to…                                            | Continue here                              |
| ------------------------------------------------------- | ------------------------------------------ |
| Run the project with your own accounts                  | [Getting started](docs/GETTING_STARTED.md) |
| Understand components and data flow                     | [Architecture](docs/ARCHITECTURE.md)       |
| Run commands, inspect logs, or change local demo access | [Development](docs/DEVELOPMENT.md)         |
| Stop, reset, or remove the environment                  | [Cleanup](docs/DEVELOPMENT.md#cleanup)     |

## Extend the demo

| Extension                                | What you will add                                                            |
| ---------------------------------------- | ---------------------------------------------------------------------------- |
| [Mobile](apps/mobile/README.md)          | Expo development build, Auth0 login, and score dashboard on Simulator/iPhone |
| [Apple Sandbox](docs/APPLE_PURCHASES.md) | Native purchase/restore and local Server Notifications through ngrok         |
| [AWS](infra/README.md)                   | CDK-managed API, provider webhooks, DynamoDB, and queue processing           |

Local features and cloud wiring differ. The AWS guide identifies the supported
paths; deploying the stack does not enable the complete cloud checkout or
Apple purchase/restore flow.

## Understand the system

| Topic                                                  | Guide                                         |
| ------------------------------------------------------ | --------------------------------------------- |
| Login, permissions, and client configuration           | [Auth0](docs/AUTH0_SETUP.md)                  |
| Checkout, verified payments, retries, and access rules | [Payments](docs/PAYMENTS.md)                  |
| Missed subscription updates and expiration            | [Reconciliation](docs/RECONCILIATION.md)     |
| Database keys, records, and atomic updates             | [DynamoDB model](docs/DYNAMODB_DATA_MODEL.md) |
| Product boundaries and learning goals                  | [Project plan](PROJECT_PLAN.md)               |
| Why the project uses these approaches                  | [Decisions](docs/DECISIONS.md)                |

The workspace separates `apps/` (clients), `services/` (executables),
`packages/` (shared code), and `infra/` (CDK and local queue definitions).
Start with the architecture guide; each component README links to its code.

## Project progress

[TASKS.md](docs/TASKS.md) is the sole implementation-status and verification
record. It distinguishes local checks, device evidence, and live AWS/provider
flows. Google provider mocks, outbox publication, and scheduled reconciliation
are tracked there; diagrams do not imply those features are complete.

For implementation work, read [AGENTS.md](AGENTS.md). Project text and code use
English. The project has no automated test suite; verification uses formatting,
lint, typechecking, builds, and targeted manual checks.
