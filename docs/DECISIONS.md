# Decisions

As of October 10, 2026. This document distinguishes agreed project direction from implementation proposals. Detailed flows are in the [project plan](../PROJECT_PLAN.md); implementation status is in the [task plan](TASKS.md).

## Agreed direction

| ID  | Decision                                        | Consequence                                                                                   |
| --- | ----------------------------------------------- | --------------------------------------------------------------------------------------------- |
| D01 | React Native and Auth0                          | Real mobile login; the SDK requires a native development build                                |
| D02 | Authentication directly in the backend          | API Gateway without a JWT/Lambda authorizer; central token and scope checks in the BFF        |
| D03 | AWS Serverless with TypeScript and CDK          | HTTP API, Lambda, DynamoDB, SQS/DLQ, and EventBridge form the target architecture             |
| D04 | Stripe test mode; Apple/Google initially mocked | No live billing or real store integration within the weekend scope                            |
| D05 | Central subscriptions and entitlements          | Access depends on server-side permissions computed across providers                           |
| D06 | Small hands-on project                          | Implement incrementally; do not build an additional platform or admin interface               |
| D07 | Hono as the HTTP framework                      | Shared app definition, separate Node and Lambda entry points; selection delegated by the user |
| D08 | No automated tests in the learning project      | No test framework; use typechecking, linting, builds, and manual functional checks            |
| D09 | English throughout the project                  | Code, comments, messages, configuration examples, and documentation use English               |
| D10 | HTTP API `$default` integration for the BFF     | Hono owns BFF routes; separate handlers can use explicit Gateway routes with higher priority  |

## Framework: Hono

**Status: decided on October 10, 2026.** The user delegated the choice between Hono and Fastify, prioritizing straightforward Lambda integration. We chose Hono for the small API: the app definition runs as a Lambda handler through the official `@hono/aws-lambda` adapter and locally through `@hono/node-server`. Both entry points share routes and authentication middleware. Fastify remains a suitable alternative but is not introduced alongside Hono.

Domain logic remains independent of Hono. SQS and scheduled handlers need no HTTP server. P01 uses Hono 4.13.13, `@hono/aws-lambda` 1.0.1, and `@hono/node-server` 2.1.4. Versions are fixed in manifests and the lockfile; local verification is recorded in the task plan.

Sources: [Hono on AWS Lambda](https://hono.dev/docs/getting-started/aws-lambda), [Hono on Node.js](https://hono.dev/docs/getting-started/nodejs).

## Backend authentication

P02 verifies Auth0 access tokens directly in the shared Hono app, with no Gateway authorizer. `AUTH0_ISSUER` and `AUTH0_AUDIENCE` are required in both entry points. The issuer must be an HTTPS origin with its trailing slash; JWKS is derived from that origin and cannot be selected by a request. Tokens need a non-empty `kid`; scopes come from the verified `scope` claim.

Each app instance caches JWKS for ten minutes, times out retrieval after five seconds, and limits fetch attempts to once every 30 seconds, including outages. Invalid credentials return 401, insufficient scopes return 403, and unavailable keys without a usable cache return 503. Health is public; user routes registered afterward require authentication by default. `/v1/me` now resolves the verified issuer/subject through DynamoDB and returns `userId` and `createdAt`. Machine identities cannot access this user route.

## P03 infrastructure and user persistence

The development stack is environment-agnostic and synthesizes without AWS lookups. Public Auth0 values are deployment parameters. It contains only HTTP API, BFF, DynamoDB, Lambda logs, and a scoped execution role; later tasks add asynchronous resources. The table uses `RETAIN`; logs use seven-day retention and are deleted with the stack.

User storage remains inside the BFF until another service needs it. `UserStore` has no Hono or AWS dependency; `DynamoDbUserStore` implements it using consistent reads and a conditional transaction for mapping and profile creation. SHA-256 of JSON `[issuer, subject]` gives the mapping key; a random UUID gives the internal ID. There is no email-based linking or fallback user store. Local DynamoDB is explicitly configured with a loopback endpoint and dummy credentials. See the [infrastructure guide](../infra/README.md) for commands and IAM boundaries.

## P04 local mobile development

The Expo app lives in `apps/mobile` and targets the iOS Simulator first. It calls the local Hono BFF through `EXPO_PUBLIC_API_URL` while using the real Auth0 Native Application and Custom API audience. AWS deployment is not required for this local flow; deployed Gateway/Lambda verification remains separate.

The initial dependency set is Expo 57.0.27, React Native 0.86.3, React 19.2.3, and `react-native-auth0` 5.11.1, with an Expo development client. Native projects are generated from `app.config.ts` and ignored. The Auth0 SDK owns secure credential storage; the first flow requests no refresh token, so expired credentials require another login.

At the user's request, the mobile `ApiClient` uses Axios with request/response interceptors. `useApiClient` injects an Auth0-backed token provider; the request interceptor obtains current credentials and adds the Bearer header automatically. Zod schemas validate responses and infer their return types. The client centralizes cancellation, a 15-second HTTP timeout, and safe errors, without caching tokens or implementing a separate refresh flow.

The mobile app groups screens, hooks, and specialized components by feature (`auth` and `profile`). `App.tsx` composes providers; `AppContent` selects content from SDK session state. Shared UI and the API client remain outside features. The current two mutually exclusive authentication views use conditional rendering; navigation and server-state caching libraries can be evaluated when additional screens need them. See the [mobile structure guide](../apps/mobile/README.md#app-structure).

## Repository: pnpm workspaces

**Working baseline:** A private monorepo with `pnpm-workspace.yaml` and one shared `pnpm-lock.yaml`. Workspace patterns: `apps/*`, `services/*`, `packages/*`, and `infra`. Create packages only when needed; P01 starts with `services/bff`, and P03 adds `infra`.

Internal packages use names such as `@premiumpass/<name>`, set `private: true`, and reference local dependencies with `workspace:*`. Root scripts coordinate package scripts; no Turbo or Nx initially. `packageManager` pins pnpm 12.10.1. Package boundaries and the target structure are in [section 14 of the project plan](../PROJECT_PLAN.md#14-repository-and-cicd).

Source: [pnpm Workspaces](https://pnpm.io/workspaces).

## Implementation baseline

These choices guide the tasks; they do not imply that the corresponding implementation already exists. Explain routine adjustments within the assigned scope and update this document or the project plan.

| Topic                    | Baseline                                                                                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Runtime                  | Local Node.js 24.19.0 through `.nvmrc` and `engines`; Lambda target runtime Node 24                                                                    |
| Package management       | pnpm 12.10.1; shared lockfile and exact direct dependency versions                                                                                     |
| JWT                      | `jose` 6.2.12; RS256 only, fixed issuer/Custom API audience, required `exp`/`sub`, five-second clock tolerance; no custom cryptography                 |
| Tooling and verification | TypeScript 6.0.3, ESLint, and Prettier; no automated tests; TypeScript stays within the range supported by typescript-eslint. Add Zod only when needed |
| Mobile                   | Expo development build, three small screens                                                                                                            |
| Persistence              | Small DynamoDB demo table, conditional writes, and transactions                                                                                        |
| Reliability              | Shared processing path, inbox/outbox, retries/DLQ, and reconciliation                                                                                  |
| Deployment               | One development stage; GitHub Actions with OIDC in the later CI/CD task                                                                                |

The grace period, small scan-based flows, and latency targets in the project plan are deliberate demo rules. Do not present them as provider guarantees or production SLAs.

## Environment still needed

| Information                                   | Needed from      | Approach until then                                                      |
| --------------------------------------------- | ---------------- | ------------------------------------------------------------------------ |
| AWS account, profile, region                  | Live part of P03 | Synthesize CDK locally and inspect the template                          |
| Auth0 issuer, API audience, client ID, scopes | Live part of P04 | Local token and JWKS fixtures for P02                                    |
| Primary mobile verification platform          | P04              | Choose during the mobile task and document the platform actually checked |
| Stripe test price and secret references       | P06              | Use fixtures; do not reuse unrelated credentials                         |
| GitHub remote and OIDC target                 | P10              | Start with local checks; do not invent a remote                          |

Record only configuration names and non-secret decisions here. Secret values do not belong in this document.
