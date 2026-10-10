# Task plan

This file is the source of truth for implementation status. Scope and domain rules are in the [project plan](../PROJECT_PLAN.md), decisions in [DECISIONS.md](DECISIONS.md), and working rules in [AGENTS.md](../AGENTS.md).

Tasks use `Pxx` IDs. IDs `T01` through `T22` in the project plan identify manual verification scenarios, not implementation tasks. At the user's request, do not write automated tests or configure a test framework for this learning project.

## Status and sequence

Allowed status values: `open`, `in progress`, `partial`, `complete`. For `partial`, state exactly which evidence is missing. A local check does not satisfy an explicitly required live acceptance criterion.

| ID | Task | Dependencies | Status |
|---|---|---|---|
| P00 | Prepare the project for agents | — | complete |
| P01 | Local HTTP skeleton | P00 | complete |
| P02 | Backend Auth0 token verification | P01 | open |
| P03 | Small AWS stack and user persistence | P01; P02 for a protected live request | open |
| P04 | Mobile login through to the user's profile | P02, P03 | open |
| P05 | Subscription and entitlement domain rules | P01, P02, P03 | open |
| P06 | Stripe purchase and reliable processing | P02, P03, P05 | open |
| P07 | Apple/Google mocks | P05, P06 | open |
| P08 | Outbox publisher and EventBridge | P06 | open |
| P09 | Reconciliation and expiration | P07, P08 | open |
| P10 | CI/CD, operations, and final demo | P04, P06–P09 | open |

**Next task:** P02: Auth0 token verification in the Hono BFF, still without automated tests.

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

## P03 Small AWS stack and user persistence

**Outcome:** The HTTP backend runs as a Lambda behind an HTTP API; a valid request retrieves its own persisted user profile.

**Scope:** An `infra` workspace package with a CDK stack for the API, BFF, DynamoDB, logs, and narrowly scoped IAM roles. Map `iss`/`sub` identities to internal user IDs. Repeated first requests must not create multiple users. No Gateway authorizer. Document deployment configuration and actual commands.

**Local acceptance:** CDK synthesis, template inspection for resources/integration/IAM, and manual ownership mapping checks succeed. The template contains no secrets.

**Live acceptance:** Deploy to the authorized development account, check health and a protected request; repeated calls return the same user ID. Document account, region, and verified stack. If access or deployment authorization is missing, finish the local portion and mark the task `partial`, identifying the outstanding live evidence.

## P04 Mobile login through to the user's profile

**Outcome:** Login → Auth0 → AWS BFF → own profile is visible on a named mobile platform.

**Scope:** Small React Native app as an Expo development build. Auth0 login, SDK credential management, profile display, and logout. Document callback/logout URLs and non-secret configuration names. Choose the primary verification platform.

**Acceptance:** Real Auth0 login on a simulator/emulator or device, profile retrieval, and logout work. User B receives their own profile. Network/authentication errors are displayed. Tokens appear in neither AsyncStorage nor logs. Record the platform and flow actually checked.

**Boundary:** No store purchases, UI design system, or assumption that a second platform has also been verified.

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
