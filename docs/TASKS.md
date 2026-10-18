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
| P08 | Outbox publisher and EventBridge           | P06                                  | open     |
| P09 | Reconciliation and expiration              | P07, P08                             | partial  |
| P10 | CI/CD, operations, and final demo          | P04, P06–P09                         | open     |
| P11 | Self-service subscription cancellation     | P06; P07 for stores                  | partial  |

**Current focus:** P09 local reconciliation and expiration, including Apple.
The P07 real purchase/restore milestone still needs Apple account/key and device
evidence. AWS deployment and verification remain a separately authorized path.

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
  cancellation/expiry, override and signed tunnel delivery. Real Google billing is
  outside scope; independent local Google mock state and
  suppressed-event processing are implemented with P09.
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
- **Status:** no publisher/consumer implementation or live evidence yet; pending
  outbox writes already exist. See [target behavior](../PROJECT_PLAN.md#remaining-target-behavior).

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
- **Outstanding:** real Apple Sandbox reconciliation, cloud scheduling/IAM/deployment,
  a real missed-initial-webhook Stripe purchase exercise and measured seven-minute
  latency. Provider failures must never erase existing verified state.
- **Next step:** once the own Apple key/product and device are available, verify
  Sandbox renewal/expiration repair and record the provider/device evidence.

## P10 CI/CD, operations, and final demo

- **Scope:** checks in GitHub Actions, OIDC development deployment, observable
  failures and manual smoke requests using the actual repository/account context.
- **Acceptance:** satisfy the [final demonstration](../PROJECT_PLAN.md#acceptance-and-final-demonstration),
  T01–T22, CI, authorized deployment, DLQ/redrive, outbox and reconciliation.
  Record date, platform, working state, results and unresolved gaps.
- **Status:** no CI/OIDC/live demo evidence. Cleanup documentation alone does not
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
