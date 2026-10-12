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
| P04 | Mobile login through to the user's profile | P02, P03 local portion                | complete |
| P05 | Subscription and entitlement domain rules  | P01, P02, P03 local portion           | complete |
| P06 | Stripe purchase and reliable processing    | P02, P03, P05                         | partial  |
| P07 | Apple/Google mocks                         | P05, P06                              | open     |
| P08 | Outbox publisher and EventBridge           | P06                                   | open     |
| P09 | Reconciliation and expiration              | P07, P08                              | open     |
| P10 | CI/CD, operations, and final demo          | P04, P06–P09                          | open     |

**Next step:** Verify Stripe test cancellation/renewal/failed-payment and delayed-event handling. The local Auth0 → Checkout → signed webhook → queue → worker → DynamoDB → Web/Mobile Premium activation path has been verified with the configured account; local queue recovery/redrive was also verified after the service split. P06 remains partial because lifecycle scenarios and live AWS evidence remain outstanding. P04/P05 remain complete for the local iOS workflow; P03 still requires separately authorized AWS verification.

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

**BFF logging update from October 10, 2026:** Added shared structured HTTP request/completion logs with request IDs, method/path, status, severity, and handler duration. Local startup defaults to debug with bounded JSON/text body previews, query parameters, and unexpected error details; Lambda defaults to metadata-only info logs. `LOG_LEVEL` supports debug/info/warn/error/silent and rejects invalid values. `pnpm check` passed. Manual in-process requests exercised the actual app's health/unauthorized routes, and isolated middleware requests covered JSON body preservation, 403/404/500 logging, info/silent filtering, oversized/binary bodies, and a stalled stream. The 9,000-byte original request remained readable when its preview was omitted, and the stalled preview returned after its 100 ms limit. A manual invocation of the built Lambda handler returned health 200 with info logs. No automated tests, saved fixtures, Auth0 changes, or deployment were added.

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

**Local GUI update from October 10, 2026:** Added pinned `aaronshaf/dynamodb-admin:5.3.4` as a Compose service. `pnpm db:up` starts both database and GUI before running the existing table initializer. The GUI uses the internal database service name and dummy credentials; its host port is loopback-only at `127.0.0.1:8001`. Compose validation and formatting checks passed. Initial and repeated startup succeeded, and the browser displayed `premiumpass-local` with the existing profile, identity mapping, and subscription records. No data edits, automated tests, or cloud changes were performed. Commands and troubleshooting are in the [infrastructure guide](../infra/README.md#local-dynamodb-and-manual-requests).

**Local command cleanup:** Docker lifecycle commands are now consolidated under `local:*`, replacing the historical `db:*` and `billing:up`/`billing:logs` commands. `pnpm stripe:listen` forwards the supported webhook events using the Stripe CLI. See the current [command reference](../README.md#checks-and-build). `pnpm check`, Compose configuration validation, `pnpm local:up` against the existing local table, CLI argument forwarding via `pnpm stripe:listen --help`, and documentation link checks passed. The web build retains its existing bundle-size warning. No live Stripe listener, automated tests, or deployment were run.

## P04 Mobile login through to the user's profile

**Outcome:** Login → Auth0 → local Hono BFF → own profile is visible on the iOS Simulator. Verification against the deployed AWS BFF follows separately.

**Scope:** Small React Native app as an Expo development build. Auth0 login, SDK credential management, profile display, and logout. Document callback/logout URLs and non-secret configuration names. Choose the primary verification platform.

**Acceptance:** Real Auth0 login on a simulator/emulator or device, profile retrieval, and logout work. User B receives their own profile. Network/authentication errors are displayed. Tokens appear in neither AsyncStorage nor logs. Record the platform and flow actually checked.

**Boundary:** No store purchases or assumption that a second platform has also been verified. The user subsequently requested selected Gluestack UI components for the existing screens.

**Implementation from October 10, 2026:** Added `apps/mobile` with Expo 57.0.27, React Native 0.86.3, React 19.2.3, and Auth0 5.11.1. The iOS Simulator targets the local Hono BFF. The app provides Universal Login with PKCE, SDK credential storage/restoration, profile loading/reloading, logout, and safe error states. A dedicated `ApiClient` class encapsulates Axios, automatic Bearer headers, Zod response validation, cancellation, and a 15-second HTTP timeout. No refresh token is requested in this first flow. Native projects are generated and ignored; public configuration and manual steps are in the [mobile guide](../apps/mobile/README.md).

**Local source evidence:** `pnpm check` passed, including TSX formatting/linting, all workspace typechecks, backend builds, and the mobile iOS JavaScript export. Expo dependency compatibility checking and iOS prebuild passed. Inspected the generated URL schemes and local-networking ATS configuration. No automated tests or test framework were added.

**Completion from October 10, 2026:** The user confirmed that all remaining manual P04 checks pass: session restoration, logout/relogin, two-user ownership, and failure/retry scenarios. P04 is complete for the iOS Simulator against the local backend. AWS and Android verification remain outside this local scope; the earlier evidence below records intermediate limitations that this confirmation supersedes.

**User-confirmed evidence from October 10, 2026:** The user confirmed that real Auth0 login succeeds and the app displays the profile with `userId` and `createdAt` in the iOS Simulator against the local backend. The previously observed **Callback URL mismatch** no longer blocks this flow. The user supplied the Client ID through ignored `apps/mobile/.env`; the agent made no Auth0 tenant changes. This confirmation covers login and profile display, not the remaining checks above.

**Native and manual evidence:** CocoaPods installation and the Xcode Debug simulator build succeeded (zero errors, five dependency/build-script warnings). Installed and launched PremiumPass on the iPhone 17 Pro with iOS 26.5; the welcome screen and the safe sign-in failure state rendered. `pnpm install --frozen-lockfile` passed. Local BFF requests returned 200 for health and 401 without credentials; a manual request through `ApiClient` with a synthetic invalid token produced the intended safe sign-in error. The local initializer confirmed the `premiumpass-local` table is ready. Checked documentation links and diff whitespace. The initial sandboxed Metro attempt could not use filesystem watchers; the normal macOS Metro process started successfully. These checks do not yet prove real Auth0 login or authenticated profile persistence.

**API client update from October 10, 2026:** Replaced fetch with Axios 1.20.0 and added Zod 4.6.5. The request interceptor obtains a fresh token through the injected Auth0 provider for each request; screens use `useApiClient` and never handle tokens. Response errors are normalized without retaining Axios headers or payloads. Generic request/get/post helpers validate their responses with supplied Zod schemas. `pnpm check` passed. Manual local requests confirmed valid schema parsing, safe 401 mapping, invalid-response rejection, credential lookup failure, cancellation, rejection of another origin, and a fresh credential lookup for each dispatched request. In the iOS Simulator, a full JavaScript reload restored the authenticated profile with the same ID and creation time; profile reload also succeeded. This does not replace cold app restart, successful logout, or two-user verification. No automated tests, fixtures, or Auth0 tenant changes were added.

**Structure update from October 10, 2026:** Split the mobile app into composition/provider setup, feature-owned login/profile screens and hooks, shared presentation components, and the API layer. Profile loading uses explicit async states and cancels obsolete requests; identity changes reset the profile screen. The mobile guide explains the responsibilities and reading order. `pnpm check` passed after the refactor. A full JavaScript reload cleared Metro's stale imports after file moves, and the extracted login screen rendered in the iOS Simulator. Authenticated profile verification after this refactor remains outstanding because the current simulator session requires login. No navigation or UI library and no automated tests were added.

**UI and API ergonomics update from October 10, 2026:** `useApiClient()` now reads the validated API origin internally, removing URL props from the profile flow. Added development-only request/response/error logging with correlation IDs, timing, status, and unredacted synthetic bodies; headers and credentials are omitted. Manual local calls demonstrated 200 and 401 responses, POST body logging, schema rejection, missing credentials, cancellation, network failure, and disabled logging outside development mode. Integrated selected Gluestack components with NativeWind v4/Tailwind v3, semantic theme tokens, Metro/Babel configuration, and Expo-compatible Reanimated/Worklets/SVG versions. `pnpm check` passed and `pnpm peers check` reported no conflicts. Expo's offline compatibility check matched its bundled native dependency list. In the iOS Simulator, the styled profile screen rendered and reloading preserved the same user ID and creation time. Native rebuild verification is recorded separately below; logout and two-user checks remain outstanding.

**Native Gluestack evidence:** CocoaPods installation and the Xcode Debug simulator build passed with zero errors and five toolchain/build-script warnings. The rebuilt client was installed and launched on iPhone 17 Pro / iOS 26.5. Its Gluestack profile card, buttons, spacing, colors, and native typography rendered correctly; the existing session showed its profile, and a fresh profile reload preserved the same ID and creation timestamp. No automated tests or external configuration changes were added.

**Session inspector update from October 10, 2026:** Added an Auth0 session card to the dashboard with SDK OIDC profile fields, credential metadata, decoded access/ID token headers and claims, and separately revealable raw tokens. Credentials are read on demand for a temporary display snapshot; API authentication remains unchanged. Closing, backgrounding, or unmounting the inspector discards its snapshot. Added Auth0's `jwt-decode` as an explicit mobile dependency. `pnpm check` passed. In the iOS Simulator, the card and expanded OIDC/metadata/access-token/ID-token sections rendered; token values were not printed into verification output. A manual synthetic decode covered Unicode and opaque/malformed fallbacks. No automated tests or tenant changes were added.

## P05 Subscription and entitlement domain rules

**Outcome:** The domain computes reliable access rights from normalized provider states.

**Scope:** Models, status/product mappings, and `deriveEntitlements(subscriptions, now)` according to sections 7–8 of the project plan. No HTTP/AWS dependencies in the domain. Connect the Free/Premium read model and protected history access.

**Acceptance:** Manual scenarios cover active grants, pending state, cancellation at period end, expiration, revocation, a 24-hour grace period following a previously valid grant, and multiple providers. Retries do not extend grace. Time is injected. Unknown products grant no new access. API integration for T04/T22 is demonstrated.

**Boundary:** No real provider connection, plan changes, or proration.

**Implementation from October 10, 2026:** Added a pure domain module with status mapping, bounded grace, union of valid grants, exclusive time boundaries, and visible unknown mappings. The DynamoDB adapter validates ownership and fields, queries consistently with pagination, and feeds protected subscription/entitlement/history endpoints. The mobile dashboard uses Zod-validated responses, explicit history requests, foreground refresh, and boundary refresh. The local scenario CLI atomically changes only its two marked records in the Compose database. Materialized aggregate revisions, synchronization, and provider writes remain P06 work; see [subscription rules](PAYMENTS.md#access-policy) and the [data model](DYNAMODB_DATA_MODEL.md#subscriptions).

**Local evidence:** `pnpm check` and `pnpm synth` passed. Inspected the generated template: only the additional user-partition `dynamodb:Query` permission, `$default` integration, and no Gateway authorizer. Manually inspected all domain states, fixed grace after retries, an overlong grace cap, initial failure, unknown mappings, and multiple providers. Exercised the real Hono/JWT/DynamoDB Local path with temporary generated RSA credentials and an isolated in-process JWKS response: fifteen scenario combinations returned the expected tier and 200/403 history result. T22 returned 200 before and 403 exactly at the injected boundary without another write. Missing token, missing scope, machine identity, ignored client-supplied user ID, and a separate user partition were checked. Temporary verification records were removed; no automated tests or runtime authentication fallback were added.

**Simulator evidence:** After the user signed in again with `read:premium`, the Free history request showed `premium_required`. On iPhone 17 Pro / iOS 26.5, the local active scenario displayed Premium and rendered the three synthetic history points. The 30-second scenario automatically returned to Free and cleared history at the boundary; a later history request returned 403 without another provider event. Verification used a temporary BFF on port 3001 while the original BFF still selected AWS. The user then switched their BFF to Compose; the app origin was restored to port 3000, the temporary server stopped, and the two scenario records removed. The final dashboard is Free. No cloud deployment or tenant change was performed by the agent.

**Pino evidence:** Replaced the custom JSON console writer with Pino 10.4.0, a child logger per request, ISO time, and synchronous stdout. Manually checked debug JSON previews without consuming the handler's body, info-level metadata only, 401 warning level, silent output, and invalid-level rejection. Local and Lambda bundles build with the existing adapters; a manual HTTP API v2 invocation of the built Lambda returned 200 for health with Pino output. Checked 83 local documentation links and `git diff --check`.


## P06 Stripe purchase and reliable processing

**Outcome:** A real Stripe test purchase produces central entitlements through the webhook and SQS.

**Scope:** Small test website with Auth0, server-side customer mapping, and idempotent checkout. Signed webhook, work queue/DLQ, and processor. Normalization and a shared DynamoDB transaction for state, entitlements, completion marker, and outbox. Revision conditions and retries belong in this task, not a later hardening phase.

**Acceptance:** Demonstrate T05–T12 and T15–T18 in their appropriate local/live scope. A test purchase activates access; a tampered webhook or wrong account assignment fails. Queue outages produce no success acknowledgement. Duplicate and concurrent updates neither lose nor multiply grants. A failing message reaches the DLQ and can be processed after the cause is fixed.

**Boundary:** Outbox entries are already written, but the EventBridge publisher follows in P08. No live payments. If test credentials are missing, document the local portion and outstanding live scenarios precisely.

**Step 1 implementation (October 10, 2026):** Local-only Stripe test configuration, durable forward/reverse customer mapping, idempotent checkout endpoint, active-attempt locking, and bounded recovery after ambiguous provider responses. Added a React/Vite website with Auth0 React, Tailwind v4, and shadcn/ui. Customer/session metadata is assigned by the backend; redirects do not update entitlements. Setup, recovery rules, and required Auth0 SPA configuration are in [Stripe setup](PAYMENTS.md#local-startup); persisted fields are in the [data model](DYNAMODB_DATA_MODEL.md#stripe-customer-and-checkout-records). The user enters keys themselves.

**Local evidence:** `pnpm check` passed formatting, lint, all workspace typechecks and builds; Vite reports a non-blocking approximately 546 kB JavaScript chunk warning. Manual DynamoDB Local checks with an isolated in-memory provider covered same-key reuse, changed-request conflict, competing attempts, expired replacement, completed-session blocking, existing subscriptions, lost-response recovery, concurrent same-key reuse and different attempts, and two customer owners. Temporary records were removed. Separate Hono requests with generated RS256 credentials and an isolated JWKS response covered 401, scope/machine/origin 403, invalid-body/key 400, successful server-derived ownership, CORS preflight, disabled checkout 503, and unchanged Free access. No runtime auth bypass or automated test files were added. The unconfigured React/shadcn page renders setup guidance with disabled login/checkout controls. `pnpm synth` passed; the template retains the `$default` route and has no Gateway authorizer. Checked 74 local documentation file links and `git diff --check`.

**Web reload correction (October 10, 2026):** Replaced the memory-only Auth0 cache with the SDK local-storage cache, retaining valid tokens across page reloads and Stripe redirects. Refresh tokens remain disabled; renewal after expiry can still require login. Documented the storage tradeoff and same-origin login/reload/logout manual flow. Web formatting, linting, typechecking, and production build passed (existing chunk-size warning remains). Real session restoration after signing in with the new cache still needs user verification; no tenant or local secret configuration was changed.

**Verified email prefill (October 10, 2026):** Checkout now resolves email server-side from the configured Auth0 UserInfo endpoint after JWT/scope/input validation. It requires an exact subject match, a valid email, and boolean `email_verified: true`. Owned Stripe customers, including existing records, receive the email before checkout creation or reuse. Creation idempotency parameters and DynamoDB records are unchanged. Missing verification blocks checkout with a safe UI message; no client-supplied email or ID token is accepted.

**Email verification evidence:** `pnpm check` passed formatting, lint, workspace typechecks, and builds (existing web chunk-size warning remains). Manual Hono requests with generated signed tokens and process-local UserInfo responses covered verified success, unverified/string verification, subject mismatch, invalid email, rate limiting, rejected token, body-email rejection, and missing scope. Invalid requests never reached checkout; input/scope failures never contacted UserInfo. The real Stripe SDK with a process-local synthetic HTTP transport demonstrated filling an existing customer's email, skipping an unchanged value, updating a changed value, rejecting ownership mismatch, sanitizing provider failure, and retrying on the same customer. No test files, runtime mocks, real account changes, or deployment were added. Actual Auth0-to-Stripe prefill still needs verification using a verified synthetic demo account.

**Flow documentation (October 10, 2026):** Added [Stripe flow diagrams](PAYMENTS.md#payment-flow) covering the local checkout sequence, actual DynamoDB references and atomic writes, retry/concurrency rules, the planned P06/P08/P09 processing path, and current entitlement reads. Linked the walkthrough from the README, setup, data-model, and subscription guides. All five Mermaid blocks parsed successfully with Mermaid 11.12.0 using temporary documentation tooling outside the workspace. Checked 64 local links including Markdown anchors, formatted the new document, and ran `git diff --check`. No application code, dependencies, tests, or deployment changed in this documentation update.

**Step 2 implementation (October 10, 2026):** Added a separate raw-byte Stripe webhook, minimal validated queue jobs, local ElasticMQ work queue/DLQ, local worker, Lambda entry points, and CDK queue/event-source/IAM/secret-reference wiring. The processor verifies current customer/subscription ownership and paid invoice periods, then atomically stores normalized subscriptions, the all-provider entitlement snapshot, owner binding, processed marker, and pending outbox. Aggregate conflicts reread local and provider state with bounded jittered retries. Duplicate events and unchanged refreshes do not emit duplicate domain changes. The existing local scenario writer shares the aggregate transaction/CAS. Setup, supported billing limits, failure handling, and manual steps are in [Stripe processing](PAYMENTS.md#processing-and-retries).

**Step 2 local evidence:** `pnpm check` passed formatting, lint, workspace typechecks and builds; `pnpm synth` produced the three Lambda assets without deployment. Inspected the template's explicit signature-only webhook route plus BFF `$default`, no Gateway authorizer, least-scoped processing grants, batch size one/partial failures, 360-second visibility, five receives, and four-/14-day retention. Manual calls using an isolated DynamoDB Local table demonstrated atomic state/marker/outbox writes, duplicate suppression, parallel event conflict/refetch, unchanged refresh without outbox, stale-revision rejection, and preserving a Google grant after Stripe cancellation; time-based reads expired without further writes. Temporary table and records were removed. Process-local synthetic Stripe HTTP responses exercised paid activation, bounded failed-renewal grace, initial failure, zero-value invoice rejection for grace, and ownership rejection. These checks did not contact Stripe.

**Step 2 transport evidence:** Manual signed requests demonstrated missing/tampered signature 400, accepted minimal job 200, Lambda-format base64 signature verification, and queue-failure 503. An isolated pair of ElasticMQ queues demonstrated retries and DLQ transfer using shortened visibility/two receives; the configured application queue was separately inspected at 360 seconds/five receives. Temporary queues were removed. Checked 135 local documentation links including Markdown anchors, Compose configuration, and `git diff --check`. No automated tests, test framework, deployment, secret reads, or external account changes were added.

**Workspace separation and grouped development (October 10, 2026):** BFF and Billing are independent workspace packages. The BFF owns authenticated HTTP requests and checkout; Billing owns webhook ingestion, queue processing, and the local scenario/Stripe CLI scripts. Shared domain rules, DynamoDB configuration/client/subscription reads, and Pino setup use explicit workspace exports. CDK bundles the moved webhook and worker entries under their existing resource identities. Each service reads its own ignored `.env`; existing local processing settings were copied into Billing without overwriting source or target values, and the local queue URL was supplied where absent. Root `pnpm dev` starts Compose/table initialization, then supervises API, webhook, worker, and website with labeled logs. Stripe CLI and Mobile remain separate. Shared TypeScript source paths are explicitly watched.

**Verification:** `pnpm install --frozen-lockfile`, `pnpm check`, and `pnpm synth` passed. Existing bundle-size warnings remain. The generated template contains three Lambda functions, `$default` plus the explicit signature-only webhook route, no Gateway authorizer, and the existing SQS batch/partial-failure settings. Both built Billing Lambda modules import independently and export handlers without opening servers. Grouped startup succeeded against the existing local table; the API used temporary port 3001 to preserve the pre-existing process on 3000. Manual requests returned health 200, unauthenticated profile 401, unsigned webhook 400, and website 200. A temporary shared-domain source edit triggered all three backend watchers outside the sandbox; the edit was reverted and health returned 200 after restart. Initial grouped shutdown released all verification ports while retaining the Docker services. A later outside-sandbox stop left one watcher waiting after its port closed; the supervisor now requests forced termination after a 15-second shutdown timeout. A subsequent run encountered separately occupied web/webhook ports and initiated group shutdown; sandbox process-tree termination was limited, so Ctrl+C was used to finish cleanup. Verification processes were stopped; the separately running services were left untouched. Stripe CLI argument forwarding was verified through `--help`, without connecting a listener. Checked 176 relative documentation links/anchors and `git diff --check`. No automated tests, external account changes, or deployment were performed; no new authenticated checkout or mobile-flow verification is claimed.

**Real Stripe sandbox activation walkthrough (October 10, 2026):** Verified matching BFF/Billing test keys, price and local database configuration, local Mobile API configuration, and an existing Stripe CLI listener whose signing secret matched Billing. After refreshing both clients, their internal user IDs matched and both showed Free with no subscription records. The authenticated website opened hosted Stripe Checkout with the verified Auth0 email prefilled. A single sandbox purchase of PremiumPass Premium at EUR 4.99/month was completed using Stripe's documented test card and a synthetic cardholder name; saving payment details for accelerated checkout remained disabled. No live payment was made.

**Observed activation evidence:** Stripe read-only verification returned `livemode: false`, subscription `active`, invoice `paid`, `amount_paid: 499`, currency `eur`, and matching subscription owner metadata. DynamoDB Local contained one active Stripe subscription with a verified access boundary of `2026-11-10T16:55:40.000Z`, a Premium entitlement snapshot at aggregate revision 3 with one grant, completion markers for `checkout.session.completed`, `invoice.paid`, and `customer.subscription.created`, and one pending `SubscriptionChanged` outbox record. The outbox is expected to remain pending until P08. The work queue and DLQ each reported zero visible and in-flight messages at inspection. These records were created through the actual signed-webhook/queue/worker path, not seeded manually.

**Client evidence:** The website returned to `?checkout=success` and independently fetched Premium access plus the active Stripe record. Reloading the iOS Simulator dashboard showed Premium for the same internal user, with the same access boundary. The protected score-history request succeeded and displayed the three synthetic history points. The initial Mobile screen contained an older cached profile; its manual refresh aligned it with the local website before checkout. No application code, automated tests, deployment, data reset, or queue purge was needed. The test subscription and local records were deliberately retained; existing development services and the user's Stripe listener were left running.

**Cloud webhook setup documentation (October 10, 2026):** Documented first-time Secrets Manager creation, `STRIPE_SECRET_ARN`, deployment output selection, Stripe snapshot destination registration with the six supported events, signing-secret replacement/cache behavior, and separate delivery/processing verification. Linked the guide from infrastructure and processing documentation. Checked the instructions against the current handlers, secret schema/cache, stack outputs, pinned SDK version, and official Stripe/AWS documentation; 29 local links/anchors and `git diff --check` passed. No secrets, remote resources, deployment, or automated tests were created or changed. Cloud checkout remains separate outstanding work.

**Service packages (October 12, 2026):** Replaced the combined Billing workspace with `@premiumpass/stripe-webhook` and `@premiumpass/subscription-worker`, each with its own manifest, TypeScript configuration, `.env.example`, dev/start scripts and local/Lambda bundles. `@premiumpass/billing-contracts` shares only the event allowlist, job schema and type. Processing and provider/persistence adapters stay in the worker. The webhook no longer requires database settings or Stripe API credentials; the worker requires no webhook secret. Both Lambdas retain the existing shared Secrets Manager reference and resource identities. Root startup uses `dev:webhook` and `dev:worker`; listener/demo commands retain their names. Existing local configuration was copied by required field into the new ignored files without replacing existing values or deleting the original file. No runtime fallback loads the retired workspace.

**Verification:** Under Node 24.19.0/pnpm 12.10.1, `pnpm install --frozen-lockfile`, `pnpm check` and `pnpm synth` passed; existing bundle-size warnings remain. Bundle dependency inspection confirmed no worker/database code in the webhook and no Hono/webhook code in the worker. The synthesized template retains three Lambdas, the two Gateway routes without authorizers, and batch-size-one/partial-failure SQS handling; only the worker receives database configuration. Both Lambda bundles import independently. With synthetic credentials and a temporary local SQS protocol fixture, the built webhook started without worker settings and returned missing/tampered/live-event 400, signed/ignored-event 200 and queue-outage 503; the accepted job contained only the six contract fields. The built worker started without a signing secret and retried an invalid job without deleting it. Both dev watchers started and stopped; `stripe:listen --help` confirmed CLI forwarding without connecting a listener. No Stripe/AWS calls, database writes, automated tests or deployment were performed. Docker's daemon was unavailable and its installed app could not launch, so grouped Compose startup and real DynamoDB/ElasticMQ integration were not rerun for this refactor.

**Docker integration follow-up (October 12, 2026):** With the user-started stack, `pnpm dev` successfully launched Compose initialization, BFF, webhook, worker and website. Manual HTTP checks returned health 200, unauthenticated profile 401, unsigned webhook 400 and website 200. An isolated DynamoDB table and ElasticMQ queue pair used copied ownership references for the existing synthetic Stripe test subscription. A locally signed synthetic webhook triggered real read-only Stripe test API calls and atomically created the active subscription, Premium snapshot, owner binding, completion marker and one pending outbox event. Redelivery changed neither aggregate revision nor outbox count. Removing the isolated forward mapping caused retries and DLQ transfer without completing the event or changing access; restoring it and redriving the unchanged message completed verification without another domain event. The temporary queues used two-second visibility/two receives; the application queue's unchanged 360-second/five-receive policy was inspected separately. Both temporary queues drained. The original application table was compared before/after and remained unchanged. Verification processes, table and queues were removed; Docker stayed running. No new purchase, Stripe mutation, AWS deployment, application code or automated test files were introduced. This resolves the preceding Docker verification limitation; authenticated client/mobile flows were not repeated in this follow-up.

**Still outstanding:** Real-provider cancellation/renewal/failed-payment and delayed-event scenarios. AWS IAM, SQS delivery, DLQ/redrive, and latency need an authorized later deployment. Cloud checkout secret/IAM/CORS wiring and completed-attempt repurchase/recovery remain unimplemented. Outbox publication is P08; reconciliation is P09. P06 remains partial.

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
