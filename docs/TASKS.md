# Task plan

This file is the source of truth for implementation status. Scope and domain rules are in the [project plan](../PROJECT_PLAN.md), decisions in [DECISIONS.md](DECISIONS.md), and working rules in [AGENTS.md](../AGENTS.md).

Tasks use `Pxx` IDs. IDs `T01` through `T22` in the project plan identify manual verification scenarios, not implementation tasks. At the user's request, do not write automated tests or configure a test framework for this learning project.

## Status and sequence

Allowed status values: `open`, `in progress`, `partial`, `complete`. For `partial`, state exactly which evidence is missing. A local check does not satisfy an explicitly required live acceptance criterion.

| ID  | Task                                       | Dependencies                          | Status   |
| --- | ------------------------------------------ | ------------------------------------- | -------- |
| P00 | Prepare the project for agents             | —                                     | complete |
| P01 | Local HTTP skeleton                        | P00                                   | complete |
| P02 | Backend Auth0 token verification           | P01                                   | complete |
| P03 | Small AWS stack and user persistence       | P01; P02 for a protected live request | partial  |
| P04 | Mobile login through to the user's profile | P02, P03 local portion                | partial  |
| P05 | Subscription and entitlement domain rules  | P01, P02, P03                         | open     |
| P06 | Stripe purchase and reliable processing    | P02, P03, P05                         | open     |
| P07 | Apple/Google mocks                         | P05, P06                              | open     |
| P08 | Outbox publisher and EventBridge           | P06                                   | open     |
| P09 | Reconciliation and expiration              | P07, P08                              | open     |
| P10 | CI/CD, operations, and final demo          | P04, P06–P09                          | open     |

**Next step:** Finish P04's session restoration, logout, two-user profile, and remaining failure checks against the local backend. The user has confirmed successful real Auth0 login and profile display. P03's local portion is sufficient for that flow. AWS deployment and Gateway/Lambda verification remain separate and explicitly deferred.

## P00 Prepare the project for agents

**Outcome:** An agent can find project rules, confirmed/open decisions, and a small next task.

**Scope:** README, AGENTS.md, decision and task plans; align the project plan with the current direction; basic ignore and editor settings.

**Acceptance:** All local documentation links resolve. Task dependencies are consistent. Confirmed decisions and open proposals are clearly distinguished. No invented startup/test commands and no application code. Configuration examples remain versioned; local secrets are ignored.

**Evidence from October 10, 2026:** Checked 38 local documentation links, Markdown structure, task IDs, and dependencies. Checked ignore rules with `git check-ignore --no-index --stdin` for local configuration and example files. Inspected new files separately for line endings and whitespace; `git diff --check` passed. No application implemented or run.

## P01 Local HTTP skeleton

**Outcome:** Hono starts locally and builds with a separate Lambda entry point.

**Scope:** Pin Node and pnpm versions; configure a private pnpm workspace, TypeScript, linting, and formatting. Initially create only the required BFF in `services/bff`. Shared Hono app factory, local entry through `@hono/node-server`, Lambda entry through `@hono/aws-lambda`, and public `GET /health`. Check adapter compatibility for the selected versions. Fix dependencies in the lockfile and add public example configuration.

**Acceptance:** Installation from the README works. Local startup and a health request work. Typechecking, linting, formatting checks, build, and a manual health request succeed. Missing required configuration produces a clear error. Importing the app factory opens no port. The Lambda entry point can be imported; actual Gateway integration is checked manually in P03. All real commands are documented in the README.

**Boundary:** No automated tests or test frameworks. No AWS deployment, Auth0 console setup, mobile app, or empty placeholder packages for later features.

**Evidence from October 10, 2026:** Node 24.19.0 and pnpm 12.10.1. `pnpm install --frozen-lockfile` and `pnpm check` (formatting, linting, typechecking, build) passed. Built server through `PORT=0 pnpm start`: `/health` returns 200 with `{"status":"ok"}`; `/v1/me` returns 404. Missing or invalid `PORT` terminates direct local startup with an explanatory error. Importing `dist/lambda.js` returns a function export and exits without an open server. `pnpm dev` starts; file changes trigger a restart outside the sandbox, followed by a successful health request. Watcher events were not delivered inside the sandbox. All servers started for verification were stopped.

**User correction:** The initially created tests and Vitest were removed completely from source files, manifests, and the lockfile. No automated tests ran. No AWS resources were created; live Gateway verification remains in P03.

## P02 Backend Auth0 token verification

**Outcome:** Direct BFF requests are protected by the shared authentication component.

**Scope:** Implement JWT verification, fixed issuer/audience/algorithm configuration, JWKS caching, and scope checks. `GET /v1/me` uses only the verified authentication context. Until P03, it may return verified identity information without pretending persistence exists. Explicitly identify the public health route.

**Acceptance:** Scenarios T01–T03 from the project plan pass when invoking the handler directly. Also check a missing expiration claim, tampered signature, disallowed algorithm, wrong audience, unknown key, rotation, and JWKS outage. Rejected requests execute no domain handler. Logs contain no token values. Use generated keys and a controlled JWKS for local checks.

**Boundary:** No custom login/password management and no API Gateway authorizer. Auth0 login remains external; these local checks require no real credentials.

**Evidence from October 10, 2026:** `pnpm check` passed (formatting, linting, typechecking, build). Manual interactive requests used generated RSA keys and a temporary HTTPS JWKS server with a process-scoped trusted certificate. A valid token returned 200 with verified identity; missing scope returned 403. Missing/malformed token, expired or missing `exp`, invalid signature, HS256, wrong issuer/audience, future `nbf`, blank subject, and unknown `kid` returned 401. Repeated valid requests reused the cache; publishing a second key after cooldown successfully verified a second identity. During a simulated JWKS outage, the warm cache still returned 200, a fresh app returned 503, and an immediate retry made no additional JWKS request. Public health returned 200 without fetching keys. A real local HTTP request ignored a forged query-string user ID, and the built Lambda handler returned 200 for a manually supplied HTTP API v2 event. Missing configuration, HTTP issuer, and missing issuer slash were rejected. No tokens or private signing keys were printed.

**Limits:** No automated tests, test framework, or persistent fixture scripts were added. No Auth0 tenant login, AWS deployment, or database access was performed. User persistence remains P03; real mobile Auth0 login remains P04. Temporary verification servers were stopped and disposable TLS files removed.

## P03 Small AWS stack and user persistence

**Outcome:** The HTTP backend runs as a Lambda behind an HTTP API; a valid request retrieves its own persisted user profile.

**Scope:** An `infra` workspace package with a CDK stack for the API, BFF, DynamoDB, logs, and narrowly scoped IAM roles. Map `iss`/`sub` identities to internal user IDs. Repeated first requests must not create multiple users. No Gateway authorizer. Document deployment configuration and actual commands.

**Local acceptance:** CDK synthesis, template inspection for resources/integration/IAM, and manual ownership mapping checks succeed. The template contains no secrets.

**Live acceptance:** Deploy to the authorized development account, check health and a protected request; repeated calls return the same user ID. Document account, region, and verified stack. If access or deployment authorization is missing, finish the local portion and mark the task `partial`, identifying the outstanding live evidence.

**Evidence from October 10, 2026 — local portion:** Added the `infra` workspace with CDK 2.273.0 and CLI 2.1145.0. `pnpm check` and `pnpm synth` passed under Node 24.19.0/pnpm 12.10.1. Inspected the generated HTTP API routes (`AuthorizationType: NONE`), payload 2.0 Lambda integration, Node 24 ESM asset, parameter references, DynamoDB keys/billing/removal policy, log retention, throttling/concurrency, and table/log-scoped IAM. No secrets are embedded in the template. The installed Auth0 skill assets are excluded from application lint/format checks; skill files were not modified.

**Manual persistence evidence:** Used the official checksum-verified DynamoDB Local 3.3.1 archive with dummy credentials and an in-memory database. Repeated requests retained the same user ID and creation time. Twenty concurrent first requests produced one mapping and one profile. Different subjects and the same subject under another issuer produced different IDs; a fresh store instance recovered the persisted profile. A temporary local HTTPS JWKS server and generated RSA tokens exercised real HTTP ownership checks: forged query/header user IDs did not change ownership. Missing credentials returned 401; missing scope and machine tokens returned 403 without new database rows. A deliberately inconsistent mapping failed closed with a generic 500; a missing table also returned 500 while health stayed 200. Lambda rejected local endpoint configuration; the local entry rejected non-loopback/non-HTTP/path endpoints. No tokens or keys were logged.

**Artifact evidence:** Imported the actual CDK `index.mjs` asset and invoked its handler with an HTTP API v2 event. Using process-local AWS SDK endpoint overrides and dummy credentials solely for this manual invocation, it returned the same persisted profile. The built local server also returned that profile and shut down cleanly. These local invocations do not prove API Gateway behavior or IAM enforcement in AWS. No automated tests or saved verification fixtures were added. Temporary HTTP/JWKS and DynamoDB servers were stopped; disposable TLS files were removed.

**Outstanding live evidence:** No bootstrap, deployment, AWS API request, or real Auth0 login was performed. Account/profile/region selection, deployed health/protected requests, IAM behavior, and repeated requests for two actual demo users remain unverified. P03 stays `partial` because its live acceptance criteria are deliberately outside the current request. Commands and configuration are in [infra/README.md](../infra/README.md).

**Routing update from October 10, 2026:** Replaced individual Gateway route declarations with the BFF's `$default` integration. Hono owns BFF paths and methods; future separate handlers can use explicit Gateway routes. `pnpm check` and `pnpm synth` passed. Inspected the generated template: exactly one `$default` route with `AuthorizationType: NONE`, one payload 2.0 Lambda proxy integration, and invoke permission restricted to this HTTP API. The separate `$default` stage retains its 10 requests/second and burst-20 throttling. Documentation links and `git diff --check` passed. No tests or deployment were performed; live acceptance remains outstanding.

**Deployment script update from October 10, 2026:** Added `pnpm deploy:dev` and the separate `pnpm bootstrap:dev`, using ignored `infra/.env` configuration and a versioned example. Both verify the selected profile's account against `AWS_ACCOUNT_ID` before starting CDK. `--dry-run` validates configuration and prints commands without invoking AWS or CDK. `pnpm check` passed; manually previewed both modes with synthetic configuration and confirmed that an invalid account ID exits with an error. No automated tests were added. Real STS verification, bootstrap, and deployment were not executed; the live acceptance criteria remain outstanding.

**Local database workflow update from October 10, 2026:** Added Docker Compose with DynamoDB Local 3.3.1, loopback port 8000, and a persistent named volume. `pnpm db:up` starts the container and runs an idempotent initializer using the existing AWS SDK; it waits for readiness, creates the table when missing, and verifies its key schema. `pnpm db:down` preserves the volume; `pnpm db:logs` displays logs. `docker compose config --quiet` and `pnpm check` passed. Manually verified first startup/table creation, repeated startup, and down/up persistence using a temporary synthetic record, which was then removed. The local database was left running. No automated tests or AWS deployment were performed.

## P04 Mobile login through to the user's profile

**Outcome:** Login → Auth0 → local Hono BFF → own profile is visible on the iOS Simulator. Verification against the deployed AWS BFF follows separately.

**Scope:** Small React Native app as an Expo development build. Auth0 login, SDK credential management, profile display, and logout. Document callback/logout URLs and non-secret configuration names. Choose the primary verification platform.

**Acceptance:** Real Auth0 login on a simulator/emulator or device, profile retrieval, and logout work. User B receives their own profile. Network/authentication errors are displayed. Tokens appear in neither AsyncStorage nor logs. Record the platform and flow actually checked.

**Boundary:** No store purchases, UI design system, or assumption that a second platform has also been verified.

**Implementation from October 10, 2026:** Added `apps/mobile` with Expo 57.0.27, React Native 0.86.3, React 19.2.3, and Auth0 5.11.1. The iOS Simulator targets the local Hono BFF. The app provides Universal Login with PKCE, SDK credential storage/restoration, profile loading/reloading, logout, and safe error states. A dedicated `ApiClient` class encapsulates Axios, automatic Bearer headers, Zod response validation, cancellation, and a 15-second HTTP timeout. No refresh token is requested in this first flow. Native projects are generated and ignored; public configuration and manual steps are in the [mobile guide](../apps/mobile/README.md).

**Local source evidence:** `pnpm check` passed, including TSX formatting/linting, all workspace typechecks, backend builds, and the mobile iOS JavaScript export. Expo dependency compatibility checking and iOS prebuild passed. Inspected the generated URL schemes and local-networking ATS configuration. No automated tests or test framework were added.

**Outstanding:** Session restoration after an app restart, logout, two-user ownership, and remaining network/authentication failure scenarios must still be demonstrated in the simulator. P04 remains `partial`. AWS and Android verification are outside this local implementation request.

**User-confirmed evidence from October 10, 2026:** The user confirmed that real Auth0 login succeeds and the app displays the profile with `userId` and `createdAt` in the iOS Simulator against the local backend. The previously observed **Callback URL mismatch** no longer blocks this flow. The user supplied the Client ID through ignored `apps/mobile/.env`; the agent made no Auth0 tenant changes. This confirmation covers login and profile display, not the remaining checks above.

**Native and manual evidence:** CocoaPods installation and the Xcode Debug simulator build succeeded (zero errors, five dependency/build-script warnings). Installed and launched PremiumPass on the iPhone 17 Pro with iOS 26.5; the welcome screen and the safe sign-in failure state rendered. `pnpm install --frozen-lockfile` passed. Local BFF requests returned 200 for health and 401 without credentials; a manual request through `ApiClient` with a synthetic invalid token produced the intended safe sign-in error. The local initializer confirmed the `premiumpass-local` table is ready. Checked documentation links and diff whitespace. The initial sandboxed Metro attempt could not use filesystem watchers; the normal macOS Metro process started successfully. These checks do not yet prove real Auth0 login or authenticated profile persistence.

**API client update from October 10, 2026:** Replaced fetch with Axios 1.20.0 and added Zod 4.6.5. The request interceptor obtains a fresh token through the injected Auth0 provider for each request; screens use `useApiClient` and never handle tokens. Response errors are normalized without retaining Axios headers or payloads. Generic request/get/post helpers validate their responses with supplied Zod schemas. `pnpm check` passed. Manual local requests confirmed valid schema parsing, safe 401 mapping, invalid-response rejection, credential lookup failure, cancellation, rejection of another origin, and a fresh credential lookup for each dispatched request. In the iOS Simulator, a full JavaScript reload restored the authenticated profile with the same ID and creation time; profile reload also succeeded. This does not replace cold app restart, successful logout, or two-user verification. No automated tests, fixtures, or Auth0 tenant changes were added.

**Structure update from October 10, 2026:** Split the mobile app into composition/provider setup, feature-owned login/profile screens and hooks, shared presentation components, and the API layer. Profile loading uses explicit async states and cancels obsolete requests; identity changes reset the profile screen. The mobile guide explains the responsibilities and reading order. `pnpm check` passed after the refactor. A full JavaScript reload cleared Metro's stale imports after file moves, and the extracted login screen rendered in the iOS Simulator. Authenticated profile verification after this refactor remains outstanding because the current simulator session requires login. No navigation or UI library and no automated tests were added.

## P05 Subscription and entitlement domain rules

**Outcome:** The domain computes reliable access rights from normalized provider states.

**Scope:** Models, status/product mappings, and `deriveEntitlements(subscriptions, now)` according to sections 7–8 of the project plan. No HTTP/AWS dependencies in the domain. Connect the Free/Premium read model and protected history access.

**Acceptance:** Manual scenarios cover active grants, pending state, cancellation at period end, expiration, revocation, a 24-hour grace period following a previously valid grant, and multiple providers. Retries do not extend grace. Time is injected. Unknown products grant no new access. API integration for T04/T22 is demonstrated.

**Boundary:** No real provider connection, plan changes, or proration.

## P06 Stripe purchase and reliable processing

**Outcome:** A real Stripe test purchase produces central entitlements through the webhook and SQS.

**Scope:** Small test website with Auth0, server-side customer mapping, and idempotent checkout. Signed webhook, work queue/DLQ, and processor. Normalization and a shared DynamoDB transaction for state, entitlements, completion marker, and outbox. Revision conditions and retries belong in this task, not a later hardening phase.

**Acceptance:** Demonstrate T05–T12 and T15–T18 in their appropriate local/live scope. A test purchase activates access; a tampered webhook or wrong account assignment fails. Queue outages produce no success acknowledgement. Duplicate and concurrent updates neither lose nor multiply grants. A failing message reaches the DLQ and can be processed after the cause is fixed.

**Boundary:** Outbox entries are already written, but the EventBridge publisher follows in P08. No live payments. If test credentials are missing, document the local portion and outstanding live scenarios precisely.

## P07 Apple/Google mocks

**Outcome:** Two additional providers use the same domain processing path as Stripe.

**Scope:** Adapters and separate simulated provider states; a development script for purchase, renewal, cancellation, expiration, revocation, wrong owner, and outage. Event emission must be optional.

**Acceptance:** Section 10 fixtures are reproducible. T10–T15 also pass with mocks. Ending a mock subscription does not revoke valid Stripe access. Provider state storage and the local subscription read model are independent.

**Boundary:** No real Apple/Google APIs. Development helpers must not expose a public, unprotected HTTP endpoint.

## P08 Outbox publisher and EventBridge

**Outcome:** Persisted domain changes reach an event consumer and can be traced.

**Scope:** Publisher, stable domain event identifier, EventBridge bus/rule, and event log consumer. Entries remain pending until acceptance is confirmed. Make target delivery failures and asynchronous consumer execution failures visible separately.

**Acceptance:** T19 covers partial failures despite HTTP 200 and a crash after publication. Retries lose no events; duplicates can be identified by stable domain event IDs. Trace a live event from the outbox to the consumer log. Entitlement access does not depend on the event log consumer.

## P09 Reconciliation and expiration

**Outcome:** Missed updates are repaired from provider state.

**Scope:** Scheduled and manually triggered runs, pagination, discovery through known Stripe customers, and synchronization jobs through the existing processor. Reevaluate due expiration boundaries; do not implement a second domain processing path.

**Acceptance:** T20–T22 pass. A suppressed mock event is repaired; a Stripe subscription whose initial webhook was missed is discovered. Provider outages do not erase existing states. Repeating a run is harmless. Check the seven-minute demo target under healthy dependencies or identify the missing live evidence.

## P10 CI/CD, operations, and final demo

**Outcome:** Changes can be verified reproducibly, and the demo can be presented clearly.

**Scope:** Reuse local checks in GitHub Actions, OIDC for the agreed development stage, CloudWatch signals, and manual smoke requests. Use the actual repository/environment context for IAM. Add a short demo record and cleanup instructions.

**Acceptance:** Review the complete scenario matrix and definition of done in sections 15/17. Demonstrate CI and an authorized development deployment. Show DLQ/redrive, outbox, and reconciliation. Check off only criteria supported by actual evidence. Record open issues, platform checked, commit/working state, and date.

**Boundary:** No production release or automatically executed destructive cleanup.

## Handoff format

Add a brief work record under a task once it has started:

```text
Date:
Status:
Implemented:
Verified: exact command or manual flow and result
Outstanding: missing implementation or evidence
Next step:
```

Do not include secrets or full logs. Missing access is not a passed check, and a completed document is not an implemented system.
