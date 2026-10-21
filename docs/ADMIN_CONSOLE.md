# Admin console (proposal)

> **Status: proposal, not implemented.** Implementing it needs decision D14
> (below) and changes the "no additional admin UI" scope in the
> [project plan](../PROJECT_PLAN.md) and [Decisions](DECISIONS.md) D06/D12.
> Nothing here is a confirmed decision yet.

One local browser page that shows **what the backend knows right now and why**:
users, their subscriptions and grants, the derived access, processing markers,
the outbox, and the queues. It offers the actions the CLI already has, through
the same shared processing path. It is a lens for learners and operators of the
demo, not an admin platform.

## Goals and non-goals

| In scope                                                                    | Not in scope                                                                       |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Local only: DynamoDB Local and ElasticMQ, the same fixed targets as the CLI | Hosted or AWS admin, Auth0 admin role, several admin identities, roles             |
| One operator, protected by one shared password                              | A login page, sessions, user management for admins                                 |
| Read every record type, explain derived access and processing state        | Editing or deleting raw records; [DynamoDB Admin](DEVELOPMENT.md) on :8001 does that |
| Actions that already exist in `pnpm cli`, with a preview before each write  | Provider-side changes such as Stripe refunds or cancelling on a user's behalf      |
| Reload or optional meta refresh                                             | Live push updates, websockets, a client-side app                                   |

The difference to DynamoDB Admin: that tool shows raw items and lets you edit
them, bypassing every guarantee. The console shows domain views (stored versus
computed access, revision chains, completion state) and writes only through the
shared transactions.

## Decision proposal

| ID  | Proposed decision                       | Reason / consequence                                                                                                                                                      |
| --- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D14 | Local admin console in the CLI workspace | Browser view over the same local admin functions as `pnpm cli`; bound to 127.0.0.1, one shared password, fixed local targets; no hosted admin, no Auth0 admin role, no HTTP admin route in the API |

If approved: D06 stays true (one local page, not a platform). D12 keeps its trust
boundary, "access to the local machine and database", with a password in front
of the browser view. The project plan's scope row for complimentary Premium
loses "no additional admin UI".

## Placement and runtime

| Option                                                        | Advantages                                                                                          | Drawbacks                                                                                          |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| **A (recommended):** `pnpm cli admin` subcommand in `apps/cli` | Reuses the fixed local store, `premium`, `reconcile`, `stripe-sync`, and `seed` directly; same `.env` | The CLI workspace gains Hono and server-side JSX                                                    |
| B: new `apps/admin` with React/Vite like the website          | Same UI kit as the website                                                                          | Needs a JSON API, contracts, a second dev server, and moving CLI admin code into a package          |
| C: admin routes in `services/api` with an Auth0 admin role    | Path to a hosted admin                                                                              | Contradicts D12, needs a role design, adds a public attack surface                                  |

Option A treats the console as a second front end over the same functions:
the terminal and the browser call the same code, which is a teaching point in
itself. `reconcile --watch` already shows that the CLI can run a long-lived mode.

- **Rendering:** Hono with server-side JSX (`hono/jsx`), plain HTML forms, and
  Post/Redirect/Get. No client bundle, no API contracts, no CORS.
- **Look:** one CSS file with the website's color tokens
  ([`style.css`](../apps/web/src/style.css)), Geist, IDs in a monospace font.
- **Freshness:** every page load reads current state; `?refresh=5` adds a meta
  refresh, for example to watch an outbox entry change from pending to sent.
- **Start:** `pnpm admin` runs `pnpm cli admin` on `http://127.0.0.1:3006`, next
  to the webhook router on 3005; DynamoDB Admin keeps 8001. Not part of
  `pnpm dev` at first (open question 2).

Proposed code layout:

```text
apps/cli/src/admin-console/
  server.ts     Hono app: password, host and origin checks, routes
  snapshot.ts   one consistent table scan, classified into typed records
  checks.ts     consistency checks: pure functions with an injected clock
  queues.ts     ElasticMQ queue attributes, DLQ peek and redrive
  actions.ts    adapters to the existing local-admin functions
  pages/        Overview, Users, UserDetail, Subscriptions, Outbox, Processing
  style.css
```

## Access protection

The password is a speed bump for a local tool, not an identity system.

- **Password:** `ADMIN_CONSOLE_PASSWORD` in `config/.env`, synced only to
  `apps/cli/.env`. The server refuses to start without one or with fewer than
  16 characters; there is no default (fail closed).
- **HTTP Basic authentication** with Hono's `basicAuth` middleware, which
  compares in constant time. No login page or session store; the browser keeps
  the credentials until it closes.
- **Bind to 127.0.0.1** and reject any `Host` other than `127.0.0.1:3006` or
  `localhost:3006`, so a rebinding DNS name cannot reach the console.
- **Writes only by POST behind Hono's `csrf()` origin check.** Browsers send
  Basic credentials automatically, so without it any open web page could submit
  a form to the console.
- No CORS headers, `Cache-Control: no-store`, and the password never appears in
  logs.
- **Audit actor:** `<OS user> via admin console`, set by the server. Forms cannot
  supply an actor, the same rule as `changePremium` in the CLI. The shared
  password identifies no person.

A hosted version would need decisions this proposal does not make: individual
admin identities (for example an Auth0 role or SSO), authorization per action,
deployment boundaries, rate limiting, tamper-resistant audit storage, and read
models instead of scans.

## Data loading

- **One scan per page load.** A paginated, consistent `Scan` of
  `premiumpass-local`, then classification by key pattern with the existing Zod
  schemas. Invalid or unknown records are counted and listed, never dropped.
- **Why a scan is acceptable here:** user requests never scan, but local
  background tools already do (outbox publisher, reconciliation discovery). The
  table is small. A production admin would add indexes or a read model, for
  example outbox entries by status and markers by user.
- **One clock per request.** Derived access uses the domain's
  `deriveEntitlements(subscriptions, now, adminGrant)` with a single `now`,
  shown in the page header, so every number on a page refers to the same moment.
- **Queues:** `GetQueueAttributes` for `premiumpass-subscriptions`,
  `premiumpass-subscriptions-dlq`, `premiumpass-events`, and
  `premiumpass-events-dlq`.
- **Never shown:** Google purchase tokens (only the digest reference), provider
  credentials (only "configured: yes/no"), checkout URLs (not stored anyway).
  Internal IDs, Auth0 issuer/subject, and Stripe test IDs are shown; all data is
  synthetic.

| View          | Records ([data model](DYNAMODB_DATA_MODEL.md))                                                          |
| ------------- | ------------------------------------------------------------------------------------------------------- |
| Users         | `USER#U / PROFILE`, `IDENTITY#H / MAP`, `ENTITLEMENTS`, `SUB#…`, `ADMIN_GRANT#premium`                  |
| User detail   | The above plus `ADMIN_AUDIT#…`, `CUSTOMER#stripe`, `CHECKOUT#…`, owner bindings, markers, outbox by user |
| Subscriptions | `SUB#…` with owner binding (`PROVIDER#…#SUB#… / OWNER`)                                                 |
| Outbox        | `OUTBOX#U:R / EVENT` and the marker with the same correlation ID                                        |
| Processing    | `EVENT#… / PROCESSED`, queue attributes, DLQ messages                                                   |

## Views

| Page          | Answers                                                       | Content                                                                                                                                       |
| ------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Overview      | Is the system healthy, and what happened last?                | Counts, consistency checks, the pipeline from webhook to consumer with live counts, recent activity                                           |
| Users         | Who has access right now, and from which source?              | Search by user ID, Auth0 subject, or provider ID; access now, sources, snapshot revision and drift, last activity                              |
| User detail   | Why does this user have exactly this access?                  | Access explained step by step, stored snapshot versus computed now, subscriptions, admin grant and audit, checkouts, revision timeline, actions |
| Subscriptions | Which subscriptions exist, and what ends next?                | All `SUB#` records across users, filtered by provider and state, sorted by access end; owner binding shown                                    |
| Outbox        | Has every committed change been announced?                    | Pending, sent, and invalid entries; age; the change (for example free → premium); trigger; lifecycle of one entry                              |
| Processing    | What did the worker do, and is anything stuck?                | Queue depths, DLQ messages, processing markers with outcome and store completion, reconciliation activity                                     |

**Revision timeline (user detail).** Each aggregate revision is one row: the
marker that caused it, the outbox entry (if any), and the resulting tier. A
revision without an outbox entry is labelled "verified, access unchanged",
because a verification without changes updates the aggregate but adds no event.
This makes gaps in the outbox sequence explainable instead of alarming.

**Inline explanations.** Each section has one sentence on what the record means
and a link to its owning guide, so the console doubles as a map of the docs.
Every record has a collapsed "raw item" view with `pk`/`sk`.

## Consistency checks

Pure functions over the snapshot and `now`; each result links to the affected
records. They mirror the review risks in [AGENTS.md](../AGENTS.md#code-review-rules).

| Check                     | Rule                                                                                         | Severity | Suggested action                         |
| ------------------------- | -------------------------------------------------------------------------------------------- | -------- | ---------------------------------------- |
| Owner binding mismatch    | `PROVIDER#…#SUB#S / OWNER` names a different user than the `SUB#` record's owner             | Critical | Investigate; no automatic repair         |
| Snapshot drift            | Stored `ENTITLEMENTS` tier or `effectiveUntil` differs from `deriveEntitlements(now)`        | Warning  | Run the expiration check for the user    |
| Outbox waiting            | Pending entry older than 60 seconds                                                          | Warning  | Start the publisher (`pnpm dev:outbox`)  |
| Invalid records           | A record fails its schema (subscription, snapshot, outbox)                                   | Warning  | Inspect the raw item                     |
| Store completion pending  | Apple marker without `finishedAt`, or Google marker needing acknowledgement without `completedAt` | Warning  | Wait for the worker retry; check its log |
| Dead-letter messages      | Work or event DLQ is not empty                                                                | Warning  | Inspect, then redrive                    |
| Subscription not verified | Provider subscription without owner binding and without `demoScenario`                       | Info     | Created by a CLI demo override           |

## Actions

Every write follows the same pattern: form → preview (dry run, no writes) →
apply with the same request ID → result page that says what changed and what to
check next. Request IDs are generated when the form renders, so a double submit
replays the receipt instead of writing twice.

| Action                                | Shared code path                                                  | Preview | Phase |
| ------------------------------------- | ----------------------------------------------------------------- | ------- | ----- |
| Grant or change complimentary Premium | `changeAdminGrant` from `/admin-grants`, with the console actor   | Yes     | 2     |
| Revoke complimentary Premium          | Same                                                              | Yes     | 2     |
| Reconcile one user (queued)           | `runLocalReconciliation` for one user and provider                | Yes     | 2     |
| Stripe sync for one user (direct)     | `reconcileLocalSubscriptions`                                     | Yes     | 2     |
| Expiration check for one user         | Reconciliation with provider `none`                               | Yes     | 2     |
| Reconcile all users                   | `runLocalReconciliation` for all users                            | Yes     | 2     |
| Redrive the work DLQ                  | Move messages back to the work queue; jobs carry references only | Lists messages | 2 |
| Demo tools: `seed`, `set`             | Existing CLI functions, labelled "local demo override"            | No      | 2     |

Not offered: publishing the outbox (the publisher stays a separate process; the
console shows the command and the waiting time), editing or deleting records,
and anything that changes provider state. Redrive is safe because the worker
skips completed jobs through its markers; that is the same idempotency the
[retry loop](PAYMENTS.md#processing-and-retries) relies on.

## Phases

1. **Read-only console:** server, protection, snapshot loader, all six pages,
   consistency checks. Already useful for the Try it out scenarios.
2. **Actions** through the existing paths, with preview and request IDs.
3. **Optional:** start with `pnpm dev`, link pages from the Try it out guides.

## Manual verification

There are no automated tests ([D08](DECISIONS.md)). When implemented:

- `pnpm check` passes.
- Start without a password: refused. Wrong password: 401. `Host: evil.test`:
  rejected. A cross-origin form POST: rejected by the origin check.
- For one user, the user detail matches `pnpm cli list` and the items in
  DynamoDB Admin.
- Walk a Stripe test purchase: marker, new snapshot revision, outbox entry
  pending; start the publisher; the entry turns sent.
- Grant and revoke complimentary Premium: audit row, outbox entry, and the
  website shows "Complimentary Premium" accordingly.
- Seed an `expiring` scenario: drift appears after expiry; the expiration check
  clears it.

## Open questions

1. Approve D14 and the scope change (local console in the CLI workspace)?
2. Start the console with `pnpm dev`, or separately as proposed?
3. Should the console run one outbox publisher pass? Proposed: no; it would
   need the publisher pass in a shared package and would hide the separate
   process that the outbox exercise is about.
4. DLQ redrive in phase 2, or after the AWS redrive work in P06?

## Documents to update when implemented

[Decisions](DECISIONS.md) (D14, D12 wording), [project plan](../PROJECT_PLAN.md)
scope row, [Development](DEVELOPMENT.md) (command and password),
[Tasks](TASKS.md) (new task), the [CLI README](../apps/cli/README.md) code map,
and `config/targets.mjs` for the new setting. This page then becomes the
console's guide and joins the docs site.
