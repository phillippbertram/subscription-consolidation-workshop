# Decisions

As of October 13, 2026. This document distinguishes agreed project direction from implementation proposals. Detailed flows are in the [project plan](../PROJECT_PLAN.md); implementation status is in the [task plan](TASKS.md).

## Agreed direction

| ID  | Decision                                        | Consequence                                                                                   |
| --- | ----------------------------------------------- | --------------------------------------------------------------------------------------------- |
| D01 | React Native and Auth0                          | Real mobile login; the SDK requires a native development build                                |
| D02 | Authentication directly in the backend          | API Gateway without a JWT/Lambda authorizer; central token and scope checks in the BFF        |
| D03 | AWS Serverless with TypeScript and CDK          | HTTP API, Lambda, DynamoDB, SQS/DLQ, and EventBridge form the target architecture             |
| D04 | Stripe test mode; real Apple sandbox next; Google mocked | Apple sandbox replaces the planned Apple mock; no production payments or store publication |
| D05 | Central subscriptions and entitlements          | Access depends on server-side permissions computed across providers                           |
| D06 | Small hands-on project                          | Implement incrementally; do not build an additional platform or admin interface               |
| D07 | Hono as the HTTP framework                      | Shared app definition, separate Node and Lambda entry points; selection delegated by the user |
| D08 | No automated tests in the learning project      | No test framework; use typechecking, linting, builds, and manual functional checks            |
| D09 | English throughout the project                  | Code, comments, messages, configuration examples, and documentation use English               |
| D10 | HTTP API `$default` integration for the BFF     | Hono owns BFF routes; separate handlers can use explicit Gateway routes with higher priority  |
| D11 | One workspace package per executable service | Independent manifests, configuration and builds; local/Lambda adapters stay together |

## Apple sandbox priority

**Decided on October 13, 2026:** Prioritize real Apple sandbox purchases against the local backend before the remaining Stripe lifecycle exercises. Replace the Apple mock milestone with purchase, restore, server verification, and App Store Server Notifications V2. Google remains mocked. AWS deployment, production purchases, and App Store publication are not prerequisites for this local milestone. Implementation and verification status live only in [P07](TASKS.md#p07-apple-sandbox-and-google-mocks).

**Implementation choice:** Direct StoreKit integration uses `expo-iap` 6.0.1 with Expo 57/React Native 0.86 and Apple's App Store Server Library 3.1.0. The authenticated BFF enqueues purchase/restore synchronization using the existing `write:checkout` permission; only the worker holds the In-App Purchase key. The app finishes a StoreKit transaction only after polling its committed completion marker. A separate local Apple ingress verifies Notifications V2 and shares the queue. No RevenueCat dependency is introduced. Setup and behavior are in [Apple purchases](APPLE_PURCHASES.md).

The server-derived internal UUID is the `appAccountToken`; verified Apple transactions must match it. Original transaction bindings cannot transfer between accounts. Real Apple grace uses the signed provider boundary, while Stripe/mock grace retains the demo cap. Apple environments are fixed to Sandbox and included in storage/event identifiers. The user confirmed the sandbox tester and key exist and the exact product is `premiumpass.premium.monthly.v2`. Credential values, device evidence, and implementation status remain separate from that confirmation.

Sources: [Apple sandbox testing](https://developer.apple.com/documentation/storekit/testing-in-app-purchases-with-sandbox), [server notifications](https://developer.apple.com/documentation/appstoreservernotifications/enabling-app-store-server-notifications), [Expo IAP options](https://docs.expo.dev/guides/in-app-purchases/), [Apple server library](https://github.com/apple/app-store-server-library-node).

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

Physical iPhone development also uses the local BFF. LAN access is explicit (`pnpm dev:api:lan`, or `HOST=0.0.0.0 pnpm dev`); loopback remains the default. The mobile API origin may use a private IPv4 address or `.local` hostname over HTTP, with scoped iOS ATS exceptions; other hosts require HTTPS. `pnpm mobile:dev:lan` exposes Metro to the device. An optional local `IOS_BUNDLE_IDENTIFIER` preserves the identifier chosen for signing, and its lowercase form determines the Auth0 callback path. The prebuild script explicitly uses `--no-clean` to retain native project settings. See the [iPhone workflow](../apps/mobile/README.md#run-on-a-physical-iphone).

The initial dependency set is Expo 57.0.27, React Native 0.86.3, React 19.2.3, and `react-native-auth0` 5.11.1, with an Expo development client. Native projects are generated from `app.config.ts` and ignored. The Auth0 SDK owns secure credential storage; the first flow requests no refresh token, so expired credentials require another login.

At the user's request, the mobile `ApiClient` uses Axios with request/response interceptors. `useApiClient` injects an Auth0-backed token provider; the request interceptor obtains current credentials and adds the Bearer header automatically. Zod schemas validate responses and infer their return types. The client centralizes cancellation, a 15-second HTTP timeout, and safe errors, without caching tokens or implementing a separate refresh flow.

The mobile app groups screens, hooks, and specialized components by feature (`auth` and `profile`). `App.tsx` composes providers; `AppContent` selects content from SDK session state. Shared UI and the API client remain outside features. The current two mutually exclusive authentication views use conditional rendering; navigation and server-state caching libraries can be evaluated when additional screens need them. See the [mobile structure guide](../apps/mobile/README.md#app-structure).

At the user's request, the mobile UI uses selected, locally owned Gluestack components with NativeWind v4 and Tailwind v3. The light theme uses semantic color tokens. The provider remains minimal until overlays or toasts are needed. `useApiClient()` reads the configured origin internally. Development-only API logging records method, URL, parameters, bodies, status, timing, and safe error details; credentials and headers are omitted.

## Repository: pnpm workspaces

**Working baseline:** A private monorepo with `pnpm-workspace.yaml` and one shared `pnpm-lock.yaml`. Workspace patterns: `apps/*`, `services/*`, `packages/*`, and `infra`. Create packages only when needed; P01 starts with `services/bff`, and P03 adds `infra`.

Internal packages use names such as `@premiumpass/<name>`, set `private: true`, and reference local dependencies with `workspace:*`. Root scripts select individual packages by their full name using `pnpm --filter @premiumpass/<name> run <script>`; workspace-wide checks and builds use `pnpm -r`. Package scripts retain their own working directory for relative paths and `.env` loading. No Turbo or Nx initially. `packageManager` pins pnpm 12.10.1. Package boundaries and the target structure are in [section 14 of the project plan](../PROJECT_PLAN.md#14-repository-and-cicd).

The user selected one workspace package per independently operated service: BFF, Stripe webhook and subscription worker. Local and Lambda entry points remain in the same service package. `@premiumpass/billing-contracts` shares only event types and queue validation; provider adapters and processing transactions belong to the worker. Root `pnpm dev` initializes Compose/table resources, then uses `concurrently` to supervise API, webhook, worker, and website. Stripe CLI and Mobile stay separate. Each service has its own ignored `.env`; existing shell variables take precedence. Shared packages export TypeScript source for tsx and esbuild/CDK bundling; they need no generated output for development. No Turbo or Nx is needed.

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


## P05 domain and BFF logging

The BFF uses Pino with JSON stdout, per-request child loggers, and synchronous output suitable for the current Lambda adapter. Existing bounded debug previews and log-level controls remain in place. No background logging transport is needed.

Subscription access rules live in `@premiumpass/domain`, with time supplied by the caller. BFF and subscription worker share this package. Zod validates persisted subscriptions at the adapter boundary. Unknown products/statuses remain visible and grant no access.

P05 computes entitlements on reads of the user's subscriptions. It exposes each grant's source revision, without inventing a materialized aggregate revision. The transactional aggregate, event markers, outbox, and provider writers are part of P06. The local scenario command is a deliberately separate educational writer, fixed to DynamoDB Local.

## P06 checkout website

The user selected React, Tailwind CSS, and shadcn/ui for the website. `apps/web` uses Vite, the Auth0 React SDK, and a small set of locally owned shadcn components. Web Tailwind v4 is separate from mobile's NativeWind/Tailwind v3. The API hook reads its origin and injects current Auth0 credentials.

Step 1 enables checkout in the local BFF only. Customer creation and checkout attempts have durable request identifiers, forward/reverse ownership checks, and a conditional per-user purchase lock. Browser redirects never write subscriptions or entitlements. Fixed expiry and bounded recovery windows deliberately stop ambiguous retries rather than risk duplicate purchases. Cloud checkout secret/IAM wiring and recovery automation remain later work; step 2 adds the separate lifecycle worker below. See [Stripe setup](PAYMENTS.md#local-startup).

The web Auth0 SDK uses its built-in local-storage cache to retain valid sessions across reloads and Stripe redirects. Refresh tokens remain disabled; expired tokens may require interactive login if silent renewal is blocked. Persistent tokens are exposed to same-origin JavaScript, an explicit local-demo tradeoff. No custom token persistence or authentication flag is added.

Checkout resolves verified email server-side through Auth0 UserInfo after access-token validation, including a subject match. It synchronizes the email onto the owned Stripe customer before session creation/reuse, including customers created before this feature. Email is contact data only, remains outside DynamoDB, and does not influence identity or entitlement ownership. Missing verification blocks checkout with an explicit error. Customer creation parameters stay stable for idempotent recovery; email synchronization is a separate repeatable update.


## P06 processing runtime

The signed webhook and SQS worker live in `services/stripe-webhook` and `services/subscription-worker`, each with its own manifest, configuration, build and local/Lambda entries. The BFF retains Auth0, profiles, entitlement reads, and checkout. Queue contracts and logging are shared; domain/persistence are dependencies of the BFF and worker only. No service imports another service. The webhook requires neither database settings nor Stripe API credentials; the worker requires no signing secret. The HTTP API keeps its `$default` BFF integration and has one explicit signature-only webhook route. No API Gateway authorizer is added.

Local processing uses ElasticMQ 1.6.16 in Compose, not AWS queues. Its messages are in-memory; this is a learning substitute, not evidence of AWS durability. AWS uses a Standard queue, batch size one, worker timeout 60 seconds, visibility 360 seconds, five receives, and a 14-day DLQ.

A webhook triggers a current provider read. Stored forward/reverse customer ownership, Stripe metadata, and relevant paid invoice periods must agree. A revision-guarded DynamoDB transaction persists subscription, entitlement snapshot, ownership, processed marker, and pending outbox. The P05 demo writer now shares the aggregate transaction/CAS. Access still checks expiration on reads. EventBridge publishing and scheduled reconciliation remain P08/P09.

The Lambda handlers still reference the same existing Secrets Manager JSON secret by ARN, validate only their required fields, and cache those fields for five minutes; no secret creation or deployment is part of this step. Checkout itself remains local-only. Billing/logging payload restrictions also apply to webhook and worker logs. See [processing setup and limits](PAYMENTS.md#processing-and-retries).
