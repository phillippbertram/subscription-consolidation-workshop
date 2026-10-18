# PremiumPass

![Status: work in progress](https://img.shields.io/badge/status-work%20in%20progress-orange)

**A hands-on workshop on subscription consolidation: sell one subscription on
the web, iOS, and Android, and keep access correct everywhere.**

> [!NOTE]
> **Work in progress.** The local web flow with Stripe test payments works end
> to end. Real Google Play and Apple Sandbox purchases and the AWS deployment
> are prepared but not fully verified yet. Details: [TASKS](docs/TASKS.md).

![PremiumPass at a glance: users pay on the website with Stripe, in the iPhone app through the App Store, or in the Android app through Google Play. The backend translates every store, combines all purchases, and checks the clock, so every app gives the same answer to the question: is this user Premium right now?](docs/images/overview.svg)

PremiumPass is a small demo app. Users sign in, start on the **Free** plan, and
unlock a (synthetic) score history with **Premium**. Wherever they paid, every
app has to give the same answer to one question:

> **Is this user Premium right now?**

Combining several payment providers into that one answer is called
_subscription consolidation_. This repo shows how to do it, step by step, with
readable code and exercises you can run locally. Under the hood:
[Concepts](docs/CONCEPTS.md) explains the status translation, a worked example,
and the glossary.

## See it in action

![PremiumPass on the website and in the iOS app, before and after Premium: the same account first shows Free, then Premium with the unlocked score history and the grant that provides it](docs/images/web-mobile-free-premium.png)

_Website and iOS app show the same answer, because both ask the backend, never the payment page._

**Who it is for:** developers who add subscriptions to a web or mobile app, and
anyone running a workshop on payments, webhooks, or reliable backend processing.

**Built with:** TypeScript · Hono · React · Expo (React Native) · Auth0 ·
DynamoDB · SQS · AWS CDK · Stripe, App Store, and Google Play test modes.

## Why this is harder than it looks

Each challenge is something you can trigger yourself in the demo.

| Challenge                                                                            | How the demo solves it                         | Try it                                                    |
| ------------------------------------------------------------------------------------ | ---------------------------------------------- | --------------------------------------------------------- |
| **Different languages:** Stripe says `past_due`, Apple `4`, Google `IN_GRACE_PERIOD` | Translate everything into one shared model     | [Exercise 3](docs/exercises/03-consolidation.md)          |
| **A success page is not a payment:** the checkout redirect opens without paying      | Only verified provider state grants access     | [Exercise 2](docs/exercises/02-first-purchase.md)         |
| **Purchases must reach the right user:** a restore on another account                | Bind every purchase to the internal user ID    | [Exercise 7](docs/exercises/07-native-store-purchases.md) |
| **Several sources at once:** Apple ends, Stripe is still paid                        | Access is the union of all valid grants        | [Exercise 3](docs/exercises/03-consolidation.md)          |
| **Unreliable events:** webhooks arrive late, twice, or never                         | Idempotent processing and scheduled repair     | [Exercise 5](docs/exercises/05-repair-missed-updates.md)  |
| **Time matters:** a subscription ends without any notification                       | Every request compares the end time with _now_ | [Exercise 3](docs/exercises/03-consolidation.md)          |

## Quick start

You need Node and pnpm (versions in `.nvmrc` / `package.json`), Docker, a free
[Auth0](https://auth0.com/) tenant, and a [Stripe](https://stripe.com/) account
in test mode. No AWS account and no Xcode for the first steps.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Before `pnpm dev` works, connect Auth0 and Stripe once:
**[Getting started](docs/GETTING_STARTED.md)** walks you through it, with a check
after each step, up to your first test purchase.

## Learning path

Eight modules, each with a short [exercise sheet](docs/exercises/README.md):
steps to try, code to read, and questions with answers. Modules 1–6 run fully
locally; 7–8 need store or AWS accounts for their optional parts.

| Module                    | You learn                                             | Exercise                                                  |
| ------------------------- | ----------------------------------------------------- | --------------------------------------------------------- |
| 1. Login and tokens       | Auth0 login, backend token checks, scope ≠ purchase   | [Exercise 1](docs/exercises/01-login-and-tokens.md)       |
| 2. First purchase         | Checkout, signed webhook, queue, worker verification  | [Exercise 2](docs/exercises/02-first-purchase.md)         |
| 3. Consolidation          | Translate provider states, combine grants, check time | [Exercise 3](docs/exercises/03-consolidation.md)          |
| 4. Reliability            | Duplicates, revisions, atomic commit, outbox          | [Exercise 4](docs/exercises/04-reliability.md)            |
| 5. Repair missed updates  | Reconciliation and expiration                         | [Exercise 5](docs/exercises/05-repair-missed-updates.md)  |
| 6. Complimentary Premium  | Access without a purchase, audited and revocable      | [Exercise 6](docs/exercises/06-complimentary-premium.md)  |
| 7. Native store purchases | Google Play / Apple purchase, ownership binding       | [Exercise 7](docs/exercises/07-native-store-purchases.md) |
| 8. AWS                    | CDK stack, least-privilege IAM, cloud webhooks        | [Exercise 8](docs/exercises/08-aws.md)                    |

Finish with [Cleanup](docs/DEVELOPMENT.md#cleanup) to pause, reset, or remove everything.

## What is inside

| Folder      | Contents                                                                                                                                          |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/`     | [Web](apps/web/README.md) (React), [Mobile](apps/mobile/README.md) (Expo), and the developer [CLI](apps/cli/README.md)                            |
| `services/` | [API](services/api/README.md), one webhook per store, the [subscription worker](services/subscription-worker/README.md), and the outbox publisher |
| `packages/` | Shared code; the access rules live in [`domain`](packages/domain/README.md)                                                                       |
| `infra/`    | [AWS CDK stack](infra/README.md) for an optional cloud deployment                                                                                 |

| Guide                                     | Read it for                                               |
| ----------------------------------------- | --------------------------------------------------------- |
| [Concepts](docs/CONCEPTS.md)              | The core idea, the status translation table, the glossary |
| [Architecture](docs/ARCHITECTURE.md)      | Components, data flow, and what runs locally vs. in AWS   |
| [Payments](docs/PAYMENTS.md)              | Stripe flow, retries, and the exact access rules          |
| [Reconciliation](docs/RECONCILIATION.md)  | How missed updates are repaired                           |
| [Data model](docs/DYNAMODB_DATA_MODEL.md) | Records, keys, and atomic writes in one DynamoDB table    |
| [Development](docs/DEVELOPMENT.md)        | Everyday commands, logs, and local demo tools             |
| [Decisions](docs/DECISIONS.md)            | Why the project uses these approaches                     |

## What this is not

- **Not a production payment system.** Stripe test mode, Apple Sandbox, and
  Google Play license tests only; all data is synthetic.
- **Not a library.** It is readable example code with comments that explain the
  _why_; copy ideas, not modules.
- **Not finished everywhere.** Which parts are verified locally or in AWS is
  tracked in [TASKS](docs/TASKS.md).

Contributing or working with an AI agent? Read [AGENTS.md](AGENTS.md) first.
Code and docs are in English. There is no automated test suite; changes are
checked with formatting, linting, type checks, builds, and manual flows.

## Support

Did this workshop help you understand how to combine Stripe, App Store, and
Google Play subscriptions into one reliable answer? If it saved you time or a
few headaches, a coffee helps keep this demo up to date and supports more
hands-on examples like it. Thank you! ☕

<a href="https://buymeacoffee.com/phillippbertram"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" height="45"></a>
