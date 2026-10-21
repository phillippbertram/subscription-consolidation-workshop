# Task plan

The sole source of implementation status. [Project plan](../PROJECT_PLAN.md)
defines scope; [Decisions](DECISIONS.md) records choices. Each task lists what
counts as done, what exists, and what is still open. Older, detailed
verification notes remain available in the Git history of this file.

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
| P07 | Apple sandbox                              | P04, P05, P06 local processing       | partial  |
| P08 | Outbox publisher and EventBridge           | P06                                  | partial  |
| P09 | Reconciliation and expiration              | P07, P08; P12 for real Google        | partial  |
| P10 | Operations and final demo                  | P04, P06–P09, P12, P13               | open     |
| P11 | Self-service subscription cancellation     | P06; P07 for Apple; P12 for Google   | partial  |
| P12 | Google Play test purchases                 | P04, P05, P06 local processing       | partial  |
| P13 | Admin-granted complimentary Premium        | P02, P03 local, P05                  | partial  |
| P14 | Documentation site on GitHub Pages         | P00                                  | partial  |

**Current focus:** P12 real Google Play license-test purchases, starting with
Play Console preparation and the Android build. Apple provider/device checks in
P07/P09 are deferred due to account issues (user decision, October 18). Existing
Apple code and prior evidence remain; no Apple acceptance is waived or marked
complete. AWS deployment and verification remain a separately authorized path.

## P00 Prepare the project for agents

- **Acceptance:** useful agent rules, coherent links/task dependencies, confirmed
  decisions distinct from proposals, no secrets or invented commands.
- **Done:** agent rules, local-first setup and topic guides, cleanup guidance,
  architecture/data diagrams, concept page, learning path, and code written as
  workshop material.

## P01 Local HTTP skeleton

- **Acceptance:** pinned installation, local startup/health, clear configuration
  errors, checks/build, and importable Lambda handler without an open HTTP port.
- **Done:** Hono local/Lambda entries, pnpm workspace, shared HTTP/queue
  contracts, AWS factories, client feature folders, and a separate CLI workspace.
  `pnpm webhooks:listen` starts Stripe forwarding and a shared Apple/Google ngrok
  tunnel; local routing, unchanged bytes/authorization, failure responses, and
  process cleanup verified with synthetic CLI/receiver fixtures. Formatting,
  lint, types, and builds passed; no live provider/tunnel delivery checked.

## P02 Backend Auth0 token verification

- **Acceptance:** [T01–T03/T05](setup/auth0.md#manual-verification), signature/claim
  rejection, missing expiry, unknown key/rotation/cache/outage behavior, no token
  logs or runtime authentication bypass; direct handler requests are protected.
- **Done:** `jose` verification with a fixed JWKS URL, scope checks, and safe
  outage behavior, verified with isolated keys.
- **Limit:** isolated token fixtures are not tenant or cloud verification.

## P03 Small AWS stack and user persistence

- **Acceptance:** local synth/template/IAM checks and atomic identity mapping;
  then authorized deployment, health/protected requests, two stable separate
  user IDs, and recorded account/region/stack evidence.
- **Done:** CDK stack, local Compose database, idempotent initialization,
  account-checked deploy/bootstrap wrappers with dry runs; concurrent first
  logins create one identity.
- **Open:** real STS/bootstrap/deployment, API Gateway/IAM enforcement, and
  deployed requests for two real Auth0 demo users. [AWS procedure](setup/aws.md).

## P04 Mobile login through to the user's profile

- **Acceptance:** real login/profile/logout on a recorded simulator/device;
  distinct users, visible network/auth failures, and SDK-owned credentials.
- **Done:** real Auth0 login and profile on the iOS Simulator; physical iPhone
  sign-in confirmed by the user; LAN access checked.
- **Follow-up:** authenticated profile/logout on a physical iPhone, Android, and
  AWS not yet confirmed. [Mobile checks](setup/apple.md#app-checks).

## P05 Subscription and entitlement domain rules

- **Acceptance:** pure clock-injected rules; active/pending/expiry/revocation,
  period-end cancellation, bounded grace, unknown mappings and multiple providers;
  [T04/T22](PAYMENTS.md#manual-checks) through the API.
- **Done:** pure rules in the domain package; T22 switched 200 to 403 exactly at
  expiry without a write.

## P06 Stripe purchase and reliable processing

- **Acceptance:** real test purchase activates access; T05–T12 and T15–T18 cover
  owner protection, signatures, queue failure, duplicate/concurrent processing,
  DLQ/redrive and transaction crash boundaries in their local/live environments.
- **Done:** owned checkout with idempotent attempts, signature-verified webhook,
  worker with paid-period verification, atomic commit, retry/DLQ configuration.
  A real Stripe test purchase (October 10) produced Premium in Web and iOS.
  Lookup-key checkout and product-based access (October 19): local fixtures
  verified old-price retries/recovery, concurrent reservations across an offer
  change, archived-price access, invalid offers/invoices, and matching worker/CLI
  results with no dry-run writes. Formatting, lint, types, builds, and CDK
  synthesis passed; the template uses the new `productId` secret contract.
  Daily/monthly Web selection, persisted plan/price, access, cancellation and
  reconciliation now support both periods. Disposable local scenarios verified
  exact daily expiry/grace, other-provider access, metadata/interval rejection,
  immutable retries and worker/CLI agreement without dry-run writes. An isolated
  browser preview verified selection, reload/retry preservation, a fresh choice
  after expiry and legacy monthly recovery; no real authentication or payment.
  API `.env` now has separate monthly/daily lookup keys. Read-only Stripe checks
  resolved the existing EUR 4.99/month and EUR 1.00/day test prices through the
  backend adapter. No checkout or payment was created during those checks.
- **Open:** real daily purchase/access and cancellation/renewal/failed-payment
  and delayed-event scenarios; restart local processes; actual sandbox
  lookup-key transfer and archived-price renewal; cloud billing secret/IAM/CORS;
  deployed SQS/DLQ/redrive; the 30-second target.

## P07 Apple sandbox

- **Acceptance:** real iPhone purchase/restore activates only the matching user;
  committed state precedes backend Apple finish, which survives retries;
  queue acknowledgement follows recorded finish; signed lifecycle delivery
  updates access; T10–T15 preserve ownership and other valid provider grants.
- **Done:** `expo-iap` purchase/restore/management, Sandbox verification,
  immutable owner binding, sync polling, notification ingress, backend finish
  after commit; default-off AWS notification wiring. Verified with isolated
  provider responses only. The Google mock was removed on October 21 (user
  decision); local exercises use Stripe test mode and Apple demo records.
- **Refactor:** Apple/Google purchase hooks use local reducers in provider folders;
  native purchase/restore regression checks remain open.
- **Open (deferred, account issues):** real purchase, restore, management,
  renewal, expiry, and signed tunnel delivery on a device. Cloud: deploy with a
  real secret, register the URL, and wire cloud Apple sync.
  [Apple checks](setup/apple.md#manual-device-checks).

## P08 Outbox publisher and EventBridge

- **Scope:** publisher, stable IDs, EventBridge bus/rule/log consumer; mark only
  accepted entries sent. Separate target delivery from Lambda execution failures.
- **Acceptance — T19:** partial `PutEvents` failure despite HTTP 200 leaves failed
  entries pending; crash-after-send retry loses nothing and duplicates retain the
  same domain event ID. Trace a live outbox event into the consumer log. Access
  must not depend on consumer success.
- **Done:** local publisher and log consumer over ElasticMQ, stable domain IDs,
  per-entry acceptance, EventBridge SDK adapter.
- **Open:** cloud bus/rule runtime, delivery versus execution failure handling,
  deployment/IAM, and a live EventBridge trace.

## P09 Reconciliation and expiration

- **Scope:** scheduled and manual paginated discovery/refresh through the same
  processor, including due expirations and missed initial Stripe webhooks.
- **Acceptance — T20:** miss a Stripe notification (listener stopped,
  subscription canceled in Stripe); reconciliation repairs it without a
  duplicate effect on repeat.
- **Acceptance — T21:** discover an owned Stripe subscription after skipping its
  initial webhook; the customer mapping must preexist.
- **Acceptance — T22:** access expires without another event; API evidence is P05.
- **Done:** local watcher for Stripe, Apple, Google, and expiration jobs;
  real Stripe test-mode preview and repair; default-off shared cloud schedule with
  one discovery Lambda per provider.
- **Open:** T20 with Stripe (earlier T20 evidence used the removed Google
  mock), real Apple Sandbox reconciliation, deployed schedule/IAM evidence, a
  real missed-initial-webhook Stripe exercise, and measured seven-minute latency.
- **Next step:** repair a real missed Google lifecycle notification through P12
  and record timing. Apple renewal/expiration repair waits for account access.

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
- **Done:** local Stripe period-end cancellation with Web confirmation and
  ownership checks; Apple and Google native management.
- **Open:** a real Stripe test cancellation through webhook and expiry, cloud
  billing, and complete Apple/Google lifecycle evidence.

## P12 Google Play test purchases

- **Scope:** one auto-renewing monthly Premium subscription, real Google Play
  license-test instruments, and a local backend with optional AWS protected API,
  notification, worker, and known-token cloud reconciliation code preparation.
  Production purchases/release and actual AWS deployment are not included.
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
- **Done:** [setup guide](setup/google.md), Google adapter, local API sync and
  completion polling, Android purchase/restore/management, authenticated RTDN
  ingress, known-token reconciliation, and default-off AWS wiring including the
  protected API. Verified with isolated Google responses only.
- **Blocked:** the native build needs NDK 27.1.12297006, which was not installed.
- **Open:** private package/upload identity, account/product/tester/RTDN setup,
  native build, signed Play upload, real Android purchase/restore/management,
  renewal/expiry/grace/hold, and missed-event reconciliation with timings.
- **Next step:** configure the private settings, upload the signed AAB, activate
  the base plan, and run the [first integration checklist](setup/google.md#ready-for-the-first-integration-run).

## P13 Admin-granted complimentary Premium

- **Scope:** allow administrators to grant, inspect, and revoke Premium for an
  existing internal user without a purchase, provider account, or subscription.
  Use a restricted background administration path; no additional admin UI.
  Support explicit expiry or access until revoked, shared by Web and Mobile.
- **Acceptance:** persist a distinct admin grant with stable ID, owner, expiry
  (if any), and audit history recording actor, timestamp, and reason for each
  change. Enforce administrative authorization separately from ordinary user
  scopes; reject unauthorized operations and unknown users. Normal Auth0 login
  and API scope requirements continue to apply to recipients. Combine admin and
  provider grants through the central policy; expiry or revocation of one source
  preserves every other grant; persist grant, entitlement, audit, and outbox
  atomically; API reads enforce expiry without a scheduled update.
- **Manual verification:** grant access to a synthetic user with no purchase;
  verify the same Premium features in Web and Mobile and unchanged access for
  another user. Exercise timed expiry, access until revoked, repeat operations,
  unauthorized requests, concurrent provider updates, and revocation/expiry in
  both overlap directions.
- **Done:** `pnpm cli premium grant|revoke|list` on the fixed local database,
  required reason and OS actor, atomic grant/audit/snapshot/outbox writes, shared
  processing package; verified against a disposable local database.
- **Open:** end-to-end refresh and visual checks in the authenticated Web app and
  on a mobile simulator/device.

## P14 Documentation site on GitHub Pages

- **Scope:** publish `docs/` as a site that guides readers through setting up
  the whole project once and testing it. Exercise content becomes "Try it out"
  pages; no course features such as progress tracking.
- **Acceptance:** the site builds from unchanged GitHub-compatible Markdown with
  no broken links; setup path, Try it out, How it works, and Reference in the
  sidebar; one setup page per external system in `docs/setup/`; PremiumPass
  colors and font in light and dark; GitHub Actions deploys `main` to Pages;
  manual check of the built site at desktop and phone width.
- **Done:** phase 1. `apps/docs` (VitePress 1.6.4, default theme) renders
  `docs/` with one route rule for rewrites and links, GitHub-compatible heading
  anchors, code links to GitHub, a build failure for missing link targets,
  lazy Mermaid diagrams, and local search. `pnpm check` passed. Preview checked
  manually: Mermaid in light and dark, code links, search, phone width without
  horizontal scrolling. Phase 2: exercises 1–6 are Try it out pages in
  `docs/try-it/` with a test checklist; exercise 7 part A is
  [purchase ownership](STORE_PURCHASES.md#purchase-ownership), exercise 8 part A opens
  [AWS deployment](setup/aws.md); the sidebar follows the setup path. A one-off
  script confirmed every relative link
  and heading anchor in the repository's Markdown; `pnpm check` passed; Previous
  and Next walk the path in the preview. Phase 3: `theme/brand.css` with the web
  app's colors, derived dark values, and Geist; start page with hero, four
  tiles, and the work-in-progress note; `.github/workflows/docs.yml` builds
  every pull request and push and deploys `main` to Pages, with actions pinned
  to commit SHAs. `pnpm check` and the link script passed; preview checked in
  light and dark and at phone width (Geist loaded, Mermaid drawn, no horizontal
  scrolling). Phase 4: `docs/setup/` has an overview plus Workspace, Auth0,
  Stripe, Apple + iOS app, Google + Android app, and AWS, built from Getting
  started, Prerequisites, the provider guides, the mobile guide, and the Stripe
  setup parts of Payments; the concept sections of the store guides form
  [Store purchases](STORE_PURCHASES.md). Decisions and the Google mock are off
  the site. `pnpm check` and the link script (443 links) passed; Previous and
  Next walk Setup → Try it out → platforms in the preview.
- **Open:** enable Pages (Source: GitHub Actions), push, and check the first
  workflow run and the live site. The workflow has not run on GitHub yet. The
  site build checks link targets but not heading anchors.

## Manual scenario index

| IDs               | Canonical checklist                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------ |
| T01–T03, T05      | [Auth0 verification](setup/auth0.md#manual-verification)                                         |
| T04, T06–T18, T22 | [Payments](PAYMENTS.md#manual-checks); T10–T15 also [Apple](setup/apple.md#manual-device-checks) |
| T19               | [P08 acceptance](#p08-outbox-publisher-and-eventbridge)                                          |
| T20–T21           | [P09 acceptance](#p09-reconciliation-and-expiration)                                             |

## Handoff format

Update the task here in a few lines: **done, open, next step**, and change its
status only when its acceptance is met. Name what was actually checked, never
full logs or secrets. Keep local, device, provider, and live AWS evidence
distinct. A document or successful build is not evidence that an external
integration ran.
