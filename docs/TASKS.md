# Task plan

The sole source of implementation status and verification evidence.
[Project plan](../PROJECT_PLAN.md) defines scope; [Decisions](DECISIONS.md) records
choices. Evidence below summarizes prior work; it is not a claim of a new rerun.

## Status and sequence

`partial` identifies missing implementation or evidence; local checks do not
satisfy live acceptance. Status values: `open`, `in progress`, `partial`, `complete`.

| ID  | Task                                       | Dependencies                         | Status   |
| --- | ------------------------------------------ | ------------------------------------ | -------- |
| P00 | Prepare the project for agents             | —                                    | complete |
| P01 | Local HTTP skeleton                        | P00                                  | complete |
| P02 | Backend Auth0 token verification           | P01                                  | complete |
| P03 | Small AWS stack and user persistence       | P01; P02 for protected live requests | partial  |
| P04 | Mobile login through to the user's profile | P02, P03 local                       | complete |
| P05 | Subscription and entitlement domain rules  | P01, P02, P03 local                  | complete |
| P06 | Stripe purchase and reliable processing    | P02, P03, P05                        | partial  |
| P07 | Apple sandbox and Google mocks             | P04, P05, P06 local processing       | partial  |
| P08 | Outbox publisher and EventBridge           | P06                                  | partial  |
| P09 | Reconciliation and expiration              | P07, P08; P12 for real Google        | partial  |
| P10 | Operations and final demo                  | P04, P06–P09, P12, P13               | open     |
| P11 | Self-service subscription cancellation     | P06; P07 for Apple; P12 for Google   | partial  |
| P12 | Google Play test purchases                 | P04, P05, P06 local processing       | partial  |
| P13 | Admin-granted complimentary Premium        | P02, P03 local, P05                  | open     |

**Current focus:** P12 real Google Play license-test purchases, starting with
Play Console preparation and the Android build. Apple provider/device checks in
P07/P09 are deferred due to account issues (user decision, October 18). Existing
Apple code and prior evidence remain; no Apple acceptance is waived or marked
complete. AWS deployment and verification remain a separately authorized path.

## P00 Prepare the project for agents

- **Acceptance:** useful agent rules, coherent links/task dependencies, confirmed
  decisions distinct from proposals, no secrets or invented commands.
- **Evidence, October 10:** 38 links checked, ignore rules and whitespace passed.
- **Documentation refresh, October 14:** local-first setup, canonical topic guides,
  ngrok and cleanup added. `pnpm format` and `pnpm check` passed (known Web
  bundle-size warning). Markdown formatting, 159 local links/anchors, seven
  rendered Mermaid diagrams, and diff whitespace checked. The Apple test-request
  snippet was syntax-checked and its SDK methods verified without making requests.
  No runtime files, external accounts, or resources changed; no live setup or
  destructive cleanup was executed.
- **New-developer review, October 14:** clarified tool installation, verified test
  identities, Stripe configuration/ownership, and Mobile/Apple/AWS prerequisites.
  Compared setup with code and official provider guides; `pnpm format`,
  `pnpm check`, Markdown formatting, 160 local links/anchors, and diff checks
  passed (same Web bundle warning). No fresh-account setup or device run performed.

- **Workshop readability, October 15:** recorded the code-as-learning-material
  rule in `AGENTS.md`; added targeted explanations to 13 source files covering
  checkout recovery, access expiration, Apple completion, reconciliation,
  outbox delivery, and client caching. Comments identify demo tradeoffs and
  concrete production considerations. `pnpm format`, `pnpm check` (including
  iOS JavaScript export), and a TypeScript syntax comparison with comments
  removed passed; executable code and types are unchanged from the starting
  working tree. The Web bundle-size warning remains. No new automated tests,
  device runs, provider requests, or AWS verification were needed or performed.

- **Architecture/data diagrams, October 18:** added explicit Auth0 login/token
  exchange and API JWKS retrieval to the overview, local, and AWS diagrams.
  Replaced the data-model flowchart with logical ER views for identity/profile,
  subscriptions, owner bindings, current access, processing/outbox, checkout,
  and local mock source records. Explained cardinalities, optional records,
  embedded grants, historical outbox revisions, and record-family navigation;
  planned admin grants remain outside the implemented model. These are logical
  relations in one table, not additional tables or database foreign keys.
  Five Mermaid diagrams parsed/rendered; the ER views and AWS/Auth0 topology were
  visually inspected against the persistence/authentication code. `pnpm format`,
  `pnpm check`, Markdown formatting, 100 relative links/anchors, and diff checks
  passed (existing Web bundle-size warning). Documentation only; no runtime,
  infrastructure, tenant, or deployment changes.

- **Architecture presentation, October 18:** styled overview/local/AWS Mermaid
  diagrams with an explicit base theme, role/provider fill and text colors,
  storage/queue shapes, and neutral runtime containers. Added a self-contained
  conceptual SVG overview with embedded Apple, Google, Auth0, and Stripe logos;
  detailed wiring remains in Mermaid. Documented renderer-dependent icon packs,
  logo sources, and the SVG maintenance boundary. All five Mermaid diagrams
  parsed/rendered; SVG and AWS colors were visually inspected. A source comparison
  confirmed all existing Mermaid nodes, labels, and connections were preserved.
  SVG XML/reference checks, Markdown formatting, 101 relative links/anchors,
  scoped diff checks, and `pnpm format` / `pnpm check` passed; the known Web
  bundle-size warning remains. No runtime, cloud, or tenant changes were made.

## P01 Local HTTP skeleton

- **Acceptance:** pinned installation, local startup/health, clear configuration
  errors, checks/build, and importable Lambda handler without an open HTTP port.
- **Implemented:** Hono local/Lambda entries, pnpm workspace services, shared HTTP/
  queue contracts and AWS factories; API route groups, client feature folders,
  worker CLI/local-admin/reconciliation separation.
- **Evidence, October 10–14:** frozen installation, `pnpm format`, `pnpm check`,
  and synthesis passed. Built health/unauthenticated requests passed. Forty-six
  isolated signed-JWT route requests preserved auth, ownership, CORS and errors.
  Both real client implementations consumed shared synthetic contracts. CLI
  flags/cancellation, zero-write previews, ownership and partial failures passed;
  read-only local DynamoDB and temporary ElasticMQ long-poll checks passed.
- **Limits:** these refactors did not rerun native rendering, real purchases, or
  deployed AWS flows; the corresponding tasks retain their own gaps.

## P02 Backend Auth0 token verification

- **Acceptance:** [T01–T03/T05](AUTH0_SETUP.md#manual-verification), signature/claim
  rejection, missing expiry, unknown key/rotation/cache/outage behavior, no token
  logs or runtime authentication bypass; direct handler requests are protected.
- **Evidence, October 10:** generated RSA keys and a temporary HTTPS JWKS exercised
  valid 200, missing scope 403, invalid tokens 401, cache reuse, rotated key,
  warm-cache outage success, fresh-resolver 503 and fetch cooldown. Forged user
  IDs were ignored; the Lambda adapter handled a local HTTP API event.
  Logging checks covered body preservation, bounded previews, status/level
  handling, and no secret output. `pnpm check` passed.
- **Limits:** isolated token fixtures are not tenant or cloud verification.

## P03 Small AWS stack and user persistence

- **Acceptance:** local synth/template/IAM checks and atomic identity mapping;
  then authorized deployment, health/protected requests, two stable separate
  user IDs, and recorded account/region/stack evidence.
- **Implemented:** CDK stack, persistent local Compose database/admin, idempotent
  initialization, account-checked deploy/bootstrap wrappers and dry runs.
- **Evidence, October 10–14:** checks/synth and template inspection passed.
  Twenty concurrent first requests produced one identity/profile; forged IDs,
  machine tokens, malformed mappings, and missing-table failures behaved safely.
  Built local/Lambda assets read the temporary local database. Compose startup,
  restart persistence, GUI and synthetic deployment validation passed. Later
  stack readability changes preserved the synthesized template.
- **Outstanding:** real STS/bootstrap/deployment, API Gateway/IAM enforcement,
  and deployed requests for two real Auth0 demo users. [AWS procedure](../infra/README.md).

## P04 Mobile login through to the user's profile

- **Acceptance:** real login/profile/logout on a recorded simulator/device;
  distinct users, visible network/auth failures, and SDK-owned credentials.
- **Evidence, October 10–13:** user confirmed real Auth0 login/profile on iOS
  Simulator. Xcode Debug builds and CocoaPods passed; iPhone 17 Pro / iOS 26.5
  Simulator displayed Gluestack/profile/session inspector and stable profile
  reload. `pnpm check`, dependency compatibility, prebuild, and local API checks
  passed. User later confirmed physical iPhone sign-in.
- **LAN evidence:** allowed origins/bindings checked; health 200 and unauthenticated
  401 over LAN; Metro served a LAN manifest. Non-clean prebuild preserved signing
  and network settings; the Native callback/logout allowlists were updated/read back.
- **Remaining follow-up:** authenticated profile retrieval/logout on physical
  iPhone, Android, and AWS were not confirmed. New dashboard/device rendering
  checks belong to P07. [Mobile checks](../apps/mobile/README.md#manual-checks).

## P05 Subscription and entitlement domain rules

- **Acceptance:** pure clock-injected rules; active/pending/expiry/revocation,
  period-end cancellation, bounded grace, unknown mappings and multiple providers;
  [T04/T22](PAYMENTS.md#manual-checks) through the API.
- **Evidence, October 10:** checks/synth passed. Fifteen manual Hono/JWT/DynamoDB
  Local combinations verified tiers/history, owner separation, unknown mappings,
  and grace bounds. T22 changed 200 to 403 exactly at expiry without a write.
  Temporary records were removed; no runtime auth fallback or test suite added.
- **Reference:** [access policy](PAYMENTS.md#access-policy), including real Apple
  grace added with P07; [local scenario tools](DEVELOPMENT.md#local-subscription-cli).

## P06 Stripe purchase and reliable processing

- **Acceptance:** real test purchase activates access; T05–T12 and T15–T18 cover
  owner protection, signatures, queue failure, duplicate/concurrent processing,
  DLQ/redrive and transaction crash boundaries in their local/live environments.
- **Implemented:** owned checkout, per-attempt idempotency/recovery, separate
  signature webhook and worker, current paid-period verification, atomic grants/
  markers/outbox, retry/DLQ configuration, and shared Web/Mobile access views.
- **Local evidence, October 10–14:** checks/synth passed; isolated JWT/provider
  and DynamoDB requests covered ownership, concurrency, paid-invoice/grace checks,
  commit conflicts and recovery. Signed webhook requests returned correct
  200/400/503; temporary ElasticMQ queues exercised retries/DLQ/redrive. Grouped
  startup and independent Lambda bundles were checked. Browser account restore,
  subscription details, and narrow layout were inspected.
- **Real Stripe test evidence, October 10:** EUR 4.99 purchase completed; provider
  read confirmed test mode, active subscription, paid invoice and matching owner.
  The actual webhook/queue/worker produced one active record, Premium snapshot,
  three completion markers, and one pending outbox event. Web and iOS Simulator
  showed matching access; protected synthetic score history loaded. Records and
  subscription were deliberately retained.
- **Later checkout check:** a fresh checkout opened but was left unpaid; it is
  not additional completed-purchase evidence.
- **Outstanding:** real cancellation/renewal/failed-payment and delayed-event
  scenarios; cloud billing secret/IAM/CORS and unresolved-outcome recovery;
  deployed IAM/SQS/DLQ/redrive and the 30-second demo target. P08/P09 remain separate.

## P07 Apple sandbox and Google mocks

- **Acceptance:** real iPhone purchase/restore activates only the matching user;
  committed state precedes backend Apple finish, which survives retries;
  queue acknowledgement follows recorded finish; signed lifecycle delivery
  updates access; T10–T15 preserve ownership and other valid provider grants.
  Google mocks require independent provider state and event suppression for P09.
- **Implemented:** direct `expo-iap`, Sandbox verification, immutable owner binding,
  authenticated local synchronization/polling, notification ingress and worker;
  current-subscription views, native management, development-only duplicate switch,
  score-first dark dashboard. AWS has notification routing and worker secret/IAM
  wiring, disabled by default; it does not provide full cloud client synchronization.
- **Local evidence, October 13:** checks/synth, prebuild and Pods passed. Temporary
  DynamoDB/ElasticMQ and isolated JWT/provider responses exercised queue-before-
  completion, wrong-owner rejection, duplicate/concurrent updates, revocation
  preserving Stripe, signed-grace boundaries and commit conflicts. Actual verifier
  rejected malformed JWS. Twelve synthetic overview scenarios and production-mode
  removal of the Sandbox override were checked. Web details dialog rendered;
  the newer native dashboard layout was not verified on device.
- **AWS wiring evidence, October 14:** checks/synth and template inspection passed;
  stable resource IDs, authorizer-free Apple route, queue-only ingress permissions,
  conditional worker secret access. Synthetic dry runs and Lambda-adapter calls
  covered configuration, base64 input, invalid JWS, disabled/TEST paths, queue
  failure, provider ownership, duplicate processing, and secret-cache expiry.
  Provider/Secrets Manager substitutes are not real AWS or Apple evidence.
- **Mobile API client, October 15:** added typed Apple config, sync-start, and
  sync-status methods using shared contracts; migrated all mobile callers and
  made generic request/get/post helpers private. Response validation and feature
  polling remain in place. `pnpm format`, `pnpm check` (including the iOS bundle
  export), and diff checks passed. No device or real Apple purchase rerun.
- **Mobile query cache, October 15:** profile, subscriptions, and score history
  now use TanStack Query with a separate in-memory cache per API/Auth0 identity.
  Logout cancels/clears queries; foreground/reconnect and verified-purchase
  callbacks refresh account data. StoreKit processing remains unchanged; the
  expiry timer hides expired cached access even when refresh is offline/failing.
  `pnpm format`, `pnpm check` (including iOS JavaScript export), and diff checks
  passed. Local synthetic HTTP requests exercised typed responses, cache reuse/
  isolation, history invalidation, 401/503 retry limits, cancellation/clearing,
  and query recovery after canceled logout. No automated test suite was added.
  Native rebuild for `expo-network`, device foreground/offline/expiry behavior,
  real account switching, and Sandbox purchase verification remain outstanding.
- **Backend Apple finish, October 15:** worker uses the official server finish
  API after atomic persistence. Markers store the verified finish target and
  later `finishedAt`; redelivery resumes finish without repeating domain/outbox
  writes. Client finish removed; polling waits for recorded finish. Notifications
  now retain the exact signed transaction ID. Worker `UpdateItem` IAM is limited
  to Apple event keys. `pnpm format`, `pnpm check`, and synth/template inspection
  passed (existing Web bundle warning). Manual execution with a disposable local
  DynamoDB table and substituted Apple responses covered finish failure, lost
  finish-marker/commit responses, duplicate/concurrent processing, ownership
  rejection, pending/completed polling, and notification transaction targeting.
  The temporary table was removed. Real Apple finish, native purchase/restore,
  and deployed IAM/delivery remain unverified; no automated tests were added.
- **Outstanding local/device:** configure own key/product/bundle and Native scopes,
  rebuild/install, then verify real purchase, restore, management, renewal,
  cancellation/expiry, override and signed tunnel delivery. Apple provider/device
  verification is deferred due to account issues. Real Google license-test billing
  is now tracked in P12; independent local Google mock state and suppressed-event
  processing are implemented with P09.
- **Outstanding cloud:** deploy with a real secret, register the sandbox URL,
  verify signed delivery/IAM/worker/access; wire authenticated cloud Apple
  config/sync/completion separately. [Apple checks](APPLE_PURCHASES.md#manual-device-checks).

## P08 Outbox publisher and EventBridge

- **Scope:** publisher, stable IDs, EventBridge bus/rule/log consumer; mark only
  accepted entries sent. Separate target delivery from Lambda execution failures.
- **Acceptance — T19:** partial `PutEvents` failure despite HTTP 200 leaves failed
  entries pending; crash-after-send retry loses nothing and duplicates retain the
  same domain event ID. Trace a live outbox event into the consumer log. Access
  must not depend on consumer success.
- **Implemented, October 15:** separate local publisher and log consumer; paginated
  pending-record scan, ten-entry batches, stable domain IDs, conditional sent
  markers, per-entry acceptance, dry-run and repeat mode. Dedicated ElasticMQ
  queue/DLQ is the local transport substitute. Official EventBridge SDK adapter
  checks the bus and individual responses; local commands never target AWS.
- **Local evidence, October 15:** `pnpm format` and `pnpm check` passed (existing
  Web bundle-size warning), as did Markdown formatting, 60 relative links/anchors,
  and diff checks. Disposable DynamoDB/ElasticMQ resources exercised the existing
  atomic writer through publication to consumer logging, unchanged snapshots/access,
  empty scan pages, batches of ten, dry-run, invalid-record isolation, missing
  receipts, outages, concurrent publishers, lost update responses, and crash-after-
  send retries with stable IDs. Substituted EventBridge SDK responses covered
  HTTP-200 partial failure and missing-bus rejection. Queue recreation after
  deletion and built-process startup/SIGTERM passed. Temporary resources were
  removed; the real local table was only previewed (14 pending, zero writes).
  No automated tests or AWS requests/deployment were added.
- **Commit verification, October 18:** `pnpm format`, `pnpm check`, changed-file
  Markdown formatting, 196 relative links/anchors, CLI help, and diff checks passed.
  A disposable DynamoDB Local table and ElasticMQ queues verified zero-write
  preview, atomic worker outbox publication to consumer logging, unchanged access,
  crash-after-send retry IDs, missing receipts, and isolated EventBridge partial
  responses/bus failures. Temporary resources were removed; no real provider or
  AWS requests/deployment were performed. Cloud acceptance remains outstanding.
- **Outstanding:** cloud runtime/CDK bus/rule and separate target-delivery versus
  Lambda-execution failure handling; deployment/IAM and a live EventBridge trace.
  Local ElasticMQ acceptance is not AWS evidence and messages do not survive a
  broker restart. [Local operation](../services/outbox-publisher/README.md).

## P09 Reconciliation and expiration

- **Scope:** scheduled and manual paginated discovery/refresh through the same
  processor, including due expirations and missed initial Stripe webhooks.
- **Implemented:** local user-specific Stripe reconciliation with preview,
  customer discovery, stored-ID rechecks, independent commits/partial failures,
  and other-provider preservation. No Stripe writes.
- **Evidence, October 13:** checks passed. Real Stripe test-state preview and
  local repair succeeded; repeat found no domain changes. Isolated provider/store
  checks covered pagination, missing records, wrong owner, provider outages,
  partial failure and zero-write preview.
- **Acceptance — T20:** suppress a change in independent Google mock state;
  reconciliation repairs it without a duplicate effect on repeat.
- **Acceptance — T21:** discover an owned Stripe subscription after skipping its
  initial webhook; the customer mapping must preexist.
- **Acceptance — T22:** access expires without another event; API evidence is P05.
- **Implemented, October 15:** local manual/all-user discovery and five-minute
  non-overlapping watcher, provider selection, zero-write preview, strict queued
  Stripe reconciliation jobs and lazy provider credentials. Independent Google
  mock source supports suppressed notifications; notification/reconciliation share
  current-state processing with immutable ownership and source/aggregate guards.
  Expiration recalculates due snapshots with atomic completion/outbox while
  retaining provider records and other grants. Provider refreshes also publish
  due snapshot changes when source fields remain unchanged.
- **Local evidence, October 15:** `pnpm format`, `pnpm check` (existing Web
  bundle-size warning), Markdown formatting, 78 relative links/anchors, and diff
  checks passed. Disposable DynamoDB/ElasticMQ resources verified T20 suppression
  and repair through the queue, zero-write preview, multi-user/empty-page discovery,
  duplicate/new-run behavior, owner rejection, missing-source failure, expiry
  preserving other grants, and partial failures. Source changes during commit and
  simultaneous expiry jobs preserved revision guards and emitted no duplicate
  effects; provider refresh crossing expiry emitted the required outbox event.
  The real Stripe SDK against a local synthetic HTTP server paginated discovery,
  recovered two missing initial subscriptions, verified paid periods, and preserved
  state/markers during outages and owner mismatch. Real Stripe test-mode dry-run
  found two unchanged subscriptions for one local user, with zero queued jobs.
  Credential-free local mock processing, cloud rejection of local-only jobs,
  bundled CLI startup/help and watcher SIGTERM passed. Temporary resources were
  removed; no automated test suite, live provider writes, AWS calls/deployment,
  or device checks were performed.
- **Apple local implementation, October 18:** added `--provider apple` and known
  Sandbox lineages to all-user/watcher runs, with lazy Apple configuration and
  strict internal run/lineage jobs. Discovery verifies current signed state;
  the worker rereads after the aggregate revision, commits through the existing
  Apple path, then finishes the latest verified transaction. Committed retries
  retain that exact target. Preview performs no writes, queue sends, or finish;
  unknown initial purchases still require sync/Restore or signed notifications.
  Cloud workers reject these jobs before provider/persistence requests.
- **Local evidence, October 18:** inspected existing uncommitted changes and
  passed baseline `pnpm check` before implementation. `pnpm format`, `pnpm check`
  (including iOS JavaScript export; existing Web bundle-size warning), source/
  bundled CLI help, 93 relative links/anchors, and diff checks passed. Manual execution with disposable
  DynamoDB Local 3.3.1/ElasticMQ 1.6.16 resources and isolated Apple client/verifier
  responses covered paginated multi-user preview with zero writes, queue-to-worker
  repair, a renewal between discovery and processing, stable/duplicate/new-run
  behavior, finish failure/retry across another renewal, outage/missing status,
  signature/environment/owner rejection, immutable owner conflicts, partial failure,
  revocation preserving Stripe, aggregate conflicts and concurrent duplicates.
  The actual Apple verifier separately rejected malformed JWS. Existing client
  sync/delayed notification targets, strict ingress separation, lazy/missing
  credentials, abort during verification, and cloud job rejection passed.
  Disposable resources were removed. No automated tests, real Apple requests,
  device checks, AWS requests/deployment, commits, or pushes were performed.
- **Documentation, October 18:** added a central [Reconciliation guide](RECONCILIATION.md)
  for the overview, provider differences, processing flow, diagnostics, and
  recovery guarantees. Linked it from README, architecture, and the worker;
  shortened repeated explanations in Payments and Apple. Commands and exercises
  remain in Development. `pnpm format`, `pnpm check` (existing Web bundle-size
  warning), new-guide Markdown formatting, CLI help, 192 relative links/anchors,
  and diff checks passed. This documentation update changes no runtime behavior
  or acceptance status; no provider, device, or AWS flows were rerun.
- **Cloud Google preparation, October 18:** a five-minute EventBridge rule and
  separate discovery Lambda use the existing Google opt-in (disabled by default).
  Paginated reads of known package-scoped token-owner records produce stable
  per-run Google refresh jobs; the existing worker performs provider verification,
  atomic commit, and acknowledgement. Discovery has conditional Scan/queue-send
  permissions, no database writes or provider credentials. IAM-authorized preview
  lists references only; partial failures/time-budget exhaustion fail visibly and
  retry with the same scheduled ID. Delivery and execution retries have a separate
  retained failure queue. This small-demo scan intentionally has no durable cursor
  or discovery index. No deployment or account changes were performed.
- **Cloud Google verification, October 18:** twelve isolated manual scenario
  groups exercised the actual discovery and worker Lambda entries using disposable
  DynamoDB Local/ElasticMQ resources and substituted Google/Secrets Manager
  responses. Covered disabled/config rejection, empty/multiple/empty-filtered
  pages, package isolation, zero-effect preview, queue acceptance/partial failure,
  missing receipts, stable retry/new-run IDs, malformed references, time-budget
  exhaustion, storage/provider outages, wrong owners, fresh state after discovery,
  missed cancellation/renewal/expiry repair, and other-provider preservation.
  Disposable resources were removed. CDK inspection preserved all 41 existing
  resource IDs/types and unchanged table/queue definitions and retention; new
  schedule state, conditional Scan/send IAM, separate failure destinations, and
  concurrency/timeout/retry limits were checked. Live scheduler delivery, deployed
  IAM, provider/device behavior, and latency remain unverified. `pnpm format`,
  `pnpm check`, `pnpm infra:synth`, Markdown formatting, 165 relative links/anchors,
  and diff checks passed; the known Web bundle-size warning remains. No automated
  tests, deployments, real AWS/Google requests, or device checks were added.
- **Outstanding:** real Apple Sandbox reconciliation, other-provider cloud
  scheduling, deployed Google schedule/IAM/queue/worker evidence,
  a real missed-initial-webhook Stripe purchase exercise and measured seven-minute
  latency. Provider failures must never erase existing verified state.
- **Next step:** exercise a real missed Google lifecycle notification through the
  P12 setup and record repair timing, preserving the local mock exercise. Apple Sandbox
  renewal/expiration repair remains deferred until account access is restored.

## P10 Operations and final demo

- **Scope:** manual development deployment, observable failures, and manual smoke
  requests using the actual account context.
- **Acceptance:** satisfy the [final demonstration](../PROJECT_PLAN.md#acceptance-and-final-demonstration),
  T01–T22, authorized deployment, DLQ/redrive, outbox and reconciliation.
  Record date, platform, working state, results and unresolved gaps.
- **Status:** no live demo evidence. Cleanup documentation alone does not
  complete this task. No production release or automatic destructive cleanup.

## P11 Self-service subscription cancellation

- **Acceptance:** owner-only, repeat-safe provider management; confirmation and
  feedback; verified renewal/access refresh, paid period retained, other grants
  preserved, and lifecycle/failure/duplicate scenarios in test/sandbox environments.
- **Implemented:** local Stripe period-end cancellation with web confirmation,
  origin/scope/input and current-provider ownership checks. Apple native management
  exists; Google requires a real billing integration before real cancellation.
- **Evidence, October 13:** checks passed. Isolated signed-JWT/provider requests
  covered unauthorized/forged owners, wrong origin, live mode, valid/repeated/
  already-ended cancellation. Only the first valid request changed the substitute
  provider; no direct entitlement write occurred.
- **Outstanding:** real Stripe test cancellation through webhook/expiry, cloud
  billing/deployment, and complete Apple/Google lifecycle evidence. Existing
  real test subscriptions were not canceled during these checks.

## P12 Google Play test purchases

- **Scope:** one auto-renewing monthly Premium subscription, real Google Play
  license-test instruments, and a local backend with optional AWS protected API,
  notification, worker, and known-token cloud reconciliation code preparation.
  Retain Google mocks for isolated exercises. Production
  purchases/release and actual AWS deployment are not included.
- **Acceptance:** Android build/install and real Auth0 login; purchase/restore
  assigned only to the verified internal owner; server verification of package,
  product/base plan, test-purchase status, current state, and expiry. Pending
  purchases grant nothing. Persist subscription/grants/completion/outbox atomically
  before backend acknowledgement; durable retries close the commit/acknowledgement
  crash window without duplicate effects. No store secrets or purchase tokens in
  client configuration/logs.
- **Lifecycle acceptance:** authenticated Pub/Sub RTDN ingress, queue-before-HTTP
  acknowledgement, current provider-state reads, duplicate/delayed/concurrent
  events, cancellation/expiry/grace/account hold, and missed-event reconciliation.
  Cancellation preserves verified paid access; another valid provider grant
  survives. Store purchase acknowledgement is separate from Pub/Sub delivery
  acknowledgement. Record real provider/device evidence for each exercised flow.
- **Implemented, October 18:** documented [Google Play setup](GOOGLE_PLAY.md),
  recommended product/base-plan IDs, internal track and separate license testing,
  API service-account permissions, and RTDN preparation. Updated the confirmed
  direction and project scope to prioritize Google while deferring Apple checks.
  This is preparation only; no Google runtime integration or account setup has
  been performed in this task.
- **Verified, October 18:** checked setup against official Google documentation
  and the existing mobile configuration/contracts. `pnpm format`, `pnpm check`
  (including the existing iOS JavaScript export), edited-file Markdown formatting,
  86 relative links/anchors, and diff whitespace checks passed. The existing Web
  bundle-size warning remains. No Android build/device run, Play Console or Cloud
  mutation, real Google request/purchase, or AWS deployment was performed.
- **Local implementation, October 18:** added a dedicated Google adapter with
  explicit service-account credentials and fixed Developer API endpoints;
  test-only product/base-plan/owner/expiry validation; authenticated local API
  config/sync/completion; Android native purchase/Restore/management and foreground
  recovery through typed client methods. All-provider persistence atomically
  commits immutable token ownership, state/access, processing intent, and outbox;
  backend acknowledgement and conditional completion follow the commit and resume
  safely on retry. Public records use token digests, and billing logs omit payloads.
  A separate local port-3004 ingress verifies Google's Pub/Sub identity, expected
  subscription and package, then enqueues stable message IDs before HTTP success.
  Known-token reconciliation uses `--provider google`; the initial cloud worker
  rejected Google jobs before the later AWS preparation below. Local mock behavior remains separate. Linked replacement tokens and offers
  are explicitly unsupported rather than granting multiple independent lineages.
- **Android preparation, October 18:** added package/version settings, a pinned
  Google Play IAP store, SDK/JDK diagnostics, Android prebuild/development commands,
  and signed/unsigned AAB commands. Generated release signing removes the debug-key
  fallback and requires private upload-key settings for signed builds. Workspace
  checks now export both iOS and Android JavaScript. Added configuration examples
  and Android Auth0 callback instructions; no tenant or Console changes performed.
- **Manual local evidence, October 18:** disposable DynamoDB Local/ElasticMQ and
  isolated Google provider/certificate responses covered 20 scenario groups:
  commit-before-acknowledgement and failed acknowledgement recovery, duplicates,
  concurrent refreshes, wrong and immutable owners, production/product/base-plan/
  expiry/linked-token rejection, provider outage, cancellation, exact grace/expiry,
  account hold preserving Stripe, pending-payment denial, zero-write discovery,
  queued repair/repeat, real Google-library signature/audience/email validation,
  authenticated RTDN/queue failure, signed-JWT API scope/input/owner-only polling,
  lost commit/completion responses, lazy credentials, cloud job rejection, and
  actual Google-client endpoint/error handling with substituted SDK responses.
  Disposable resources were removed. This is not real Google API or device evidence.
- **Code/documentation checks, October 18:** `pnpm format`, `pnpm check`
  (formatting, lint, types, backend/Web builds, iOS and Android JavaScript export),
  edited Markdown formatting, 176 relative links/anchors, CLI help, log-payload
  omission, and diff whitespace checks passed. The existing Web bundle-size
  warning remains. Android prebuild generated the Auth0 callback, pinned Play
  store, and release-signing configuration; the upload command rejected the
  placeholder package. No automated test suite was added.
- **Native build limit, October 18:** attempted an unsigned release AAB with
  Android Studio's JDK 21 and SDK 36. Gradle plugins compiled, but the required
  NDK 27.1.12297006 was absent; installation/download did not complete. The AAB
  build and download attempts were stopped, and the isolated Gradle cache has no
  running daemons. `mobile:android:doctor` now checks complete SDK/NDK/CMake
  component files before building. No finished native APK/AAB, device rendering,
  or signed-upload verification is claimed. Complete the SDK Manager installation
  before rerunning the native build.
- **Outstanding:** final package/version/upload identity and account/product/tester/
  service-account/RTDN configuration; complete NDK installation/native build,
  signed Play upload and real Android
  login/purchase/Restore/management, renewal/expiry/grace/hold, and missed-event
  reconciliation with measured timings. No real Google purchases, external account
  mutations, AWS deployment, commits, or pushes were performed.
- **AWS code preparation, October 18:** added an API Gateway Google POST route and
  Lambda adapter using the same authenticated Pub/Sub ingress. CDK configuration
  is default-off and validates opt-in package/secret/push settings; deploy dry runs
  check account/region and public identifiers. Ingress has queue-send permission,
  no database or secret access. Enabled cloud workers load a dedicated Google
  service-account JSON secret; credentials and SDK sources refresh after a
  five-minute cache. Conditional IAM covers only the required secret and Google/
  common transaction key families, with completion updates limited to Google
  event keys. At this stage, protected cloud purchase sync/polling and reconciliation
  scheduling remained unwired. No deployment or Google account mutation performed.
- **AWS preparation verification, October 18:** `pnpm format`, `pnpm check`, and
  `pnpm infra:synth` passed. Template inspection confirmed the Google route,
  default-off parameters/rule, queue-only ingress, conditional worker secret/data
  IAM, Google-event-only completion updates, and URL output. Isolated baseline
  synthesis confirmed all 32 existing resource logical IDs/types and unchanged
  table/queue definitions and retention. No resources were deployed.
  Seven synthetic deploy dry runs covered disabled/enabled settings and missing
  secret, wrong-account ARN, invalid audience/email/subscription rejection before
  AWS requests. Eight isolated cloud scenario groups covered five-minute secret/
  source refresh, safe expired-secret failure, disabled mode, local/cloud queue
  separation, real JWT verification through the Lambda/base64 adapter, stable
  event IDs, queue-failure retries, TEST non-effects, and the actual worker Lambda
  with partial-batch failures, commit-before-acknowledgement, duplicate recovery,
  and wrong-owner rejection. Its DynamoDB calls were routed to a disposable local
  table; Google, SQS, Secrets Manager, and certificates used isolated responses.
  Twenty local Google scenario groups also passed. Temporary tables/queue were
  removed. Markdown formatting and 126 relative links/anchors passed; the existing
  Web bundle-size warning remains. No real AWS/Google requests, account changes,
  device purchases, commits, or pushes were performed.
- **Protected cloud API preparation, October 18:** the API Lambda now composes
  Google config, purchase/Restore sync, and completion polling through the same
  Auth0/user/scope middleware and strict contracts as the local API. The server
  derives ownership from verified identity, returns 202 only after queue acceptance,
  and reports completion only for the owner's durably finished client operation.
  Missing/unfinished/other-owner operations all remain pending. Conditional CDK
  IAM adds queue-send and Google-marker reads only; the API receives no Google
  private key or new provider/completion write permissions. Cloud startup rejects
  local endpoint overrides. Oversized Google sync requests now return structured
  413 responses rather than the generic 500 error. At this stage, cloud scheduling
  and all live/device evidence remained outstanding; nothing was deployed.
- **Protected cloud API verification, October 18:** ten manual scenario groups
  exercised the actual API and worker Lambda entries with real RS256 validation
  against isolated JWKS responses and a disposable DynamoDB Local table. Covered
  token/scope/machine rejection before persistence, strict input/size limits,
  stable identities, queue-failure handling, base64 proxy requests, owner-only
  polling, commit/acknowledgement retry, Restore, wrong-owner rejection, duplicate
  non-effects, and default-off behavior. Google, Secrets Manager, and SQS responses
  were isolated; twenty local Google regression groups also passed. Temporary
  table/queue resources were removed. Template inspection retained all 40 existing
  resource IDs/types and unchanged table/queue definitions/retention, adding only
  the conditional API policy. `pnpm format`, `pnpm check`, and `pnpm infra:synth`
  passed; documentation formatting/links were checked. The known Web bundle-size
  warning remains. No deployment, real AWS/Google calls, or Android checks occurred.
- **Cloud reconciliation preparation, October 18:** known-token discovery,
  schedule, conditional IAM, and a separate failure queue are prepared under
  [P09](#p09-reconciliation-and-expiration). Local CLI behavior and mock exercises
  remain separate. No deployment or real Google lifecycle evidence is implied.
- **Next step:** configure the private Android and Google settings, produce/upload
  the signed AAB, activate the base plan, and run the real license-test checklist
  in [Google Play setup](GOOGLE_PLAY.md#ready-for-the-first-integration-run).

## P13 Admin-granted complimentary Premium

- **Scope:** allow administrators to grant, inspect, and revoke Premium for an
  existing internal user without a purchase, provider account, or subscription.
  Use a restricted background administration path; no additional admin UI.
  Support explicit expiry or access until revoked, shared by Web and Mobile.
- **Acceptance:** persist a distinct admin grant with stable ID, owner, expiry
  (if any), and audit history recording actor, timestamp, and reason for each
  change. Enforce administrative authorization separately from ordinary user
  scopes; reject unauthorized operations and unknown users. Normal Auth0 login
  and API scope requirements continue to apply to recipients.
- **Access and consistency:** combine admin and verified provider grants through
  the central entitlement policy. Expiry/revocation of one source preserves
  every other valid grant; reconciliation never overwrites admin grants.
  Persist grant changes, entitlement state, audit history, and outbox entries
  atomically with concurrency guards and repeat-safe operations. API reads must
  enforce expiry even without a scheduled update.
- **Manual verification:** grant access to a synthetic user with no purchase;
  verify the same Premium features in Web and Mobile and unchanged access for
  another user. Exercise timed expiry, access until revoked, repeat operations,
  unauthorized requests, concurrent provider updates, and revocation/expiry in
  both overlap directions. Show the source as complimentary access without
  inventing a paid subscription or exposing purchase-management actions for it.
- **Planned, October 18:** requirement added only. Existing local subscription
  overrides and seeded provider mocks do not satisfy this task.
- **Next step:** define the smallest privileged administration interface and
  extend the domain/storage contracts for independent admin grants; update the
  owning Payments, DynamoDB, and Development guides with the implementation.
  Any cloud administration remains subject to separate deployment authorization.

## Maintenance verification

- **Worker provider structure, October 18:** grouped Stripe, Apple, Google Play,
  and Google mocks under separate `providers/` folders. Stripe owns its contracts
  and normalization; shared aggregate/error types, domain-change detection, atomic
  persistence, and expiration remain in `processing/`. Apple/Google processors
  explicitly separate access commits from durable provider completion. Runtime,
  CLI, and reconciliation imports follow the new structure.
- **Verified locally:** `pnpm format`, `pnpm check`, and disposable DynamoDB Local/
  ElasticMQ exercises passed: Stripe paid-invoice verification, Apple finish
  failure/retry, duplicate and unchanged refreshes, wrong-owner rejection,
  revision conflicts, concurrent provider updates, due access boundaries, local
  mock/expiration dispatch, and rejection of local jobs by the cloud adapter.
  Reran 20 Google scenario groups with isolated provider/certificate responses,
  including acknowledgement recovery and queued reconciliation. Disposable
  tables/queue were removed; no automated test suite was added. Real provider,
  device, and deployed AWS acceptance remains outstanding in the existing tasks.

- **Provider persistence split, October 18:** moved Stripe, Apple, Google Play,
  and Google mock ownership checks, subscription writes, processing markers, and
  completion updates into their respective `providers/*/store.ts`. The shared
  DynamoDB store owns consistent reads, aggregate loading, single-subscription
  replacement, and the atomic revision/profile/access/outbox transaction.
  Runtime and local Stripe reconciliation compose the appropriate provider store.
- **Split verification:** `pnpm format` and `pnpm check` passed. Compared captured
  DynamoDB requests with the pre-split implementation: Stripe/Apple/Google commits
  with and without outbox entries, Apple/Google completion updates, and Google
  mock source/marker reads and commits were identical. Disposable DynamoDB Local/
  ElasticMQ reruns passed Stripe/Apple ownership, duplicate, conflict, concurrent
  grant preservation, finish retry, and due-expiry flows; 20 Google scenario groups;
  and credential-free mock/expiration runtime dispatch. Temporary tables/queue
  were removed. These checks use isolated provider responses; real provider,
  device, and deployed AWS acceptance remains unchanged.

- **Provider construction factories, October 18:** moved SDK/source/store/processor
  construction into each provider's `factory.ts`. The runtime keeps a short typed
  switch, shared connection/configuration reuse, and Apple's local-only
  reconciliation guard. Google retains a lazy source per runtime and validates
  settings on every selection; Stripe/Apple credential caches are unchanged.
  Mock/expiration factories reject cloud jobs without loading provider credentials.
- **Factory verification:** `pnpm format`, `pnpm check`, and disposable manual
  checks passed. Synthetic keys and isolated Secrets Manager/processor responses
  exercised construction, explicit configuration errors, lazy Google creation,
  per-runtime source reuse, separate cloud credential caches, matching provider
  dispatch, and rejection of local jobs/Apple reconciliation before secret reads.
  Actual mock/expiration dispatch ran against a disposable DynamoDB Local table,
  including duplicate/revoked mock access; the table and synthetic key files were
  removed. No automated test suite was added. These checks did not include real
  provider requests, native builds, or AWS deployment.

## Manual scenario index

| IDs               | Canonical checklist                                                                                  |
| ----------------- | ---------------------------------------------------------------------------------------------------- |
| T01–T03, T05      | [Auth0 verification](AUTH0_SETUP.md#manual-verification)                                             |
| T04, T06–T18, T22 | [Payments](PAYMENTS.md#manual-checks); T10–T15 also [Apple](APPLE_PURCHASES.md#manual-device-checks) |
| T19               | [P08 acceptance](#p08-outbox-publisher-and-eventbridge)                                              |
| T20–T21           | [P09 acceptance](#p09-reconciliation-and-expiration)                                                 |

## Handoff format

Update the relevant task with **date, implemented, verified, outstanding, next
step**. Include exact commands or manual outcomes, not full logs or secrets.
Keep local, device, provider, and live AWS evidence distinct. A document or
successful build is not evidence that an external integration ran.
