# Admin console (proposal)

> **Status: proposal, not implemented.** Implementing it needs decision D14
> (below) and changes the "no additional admin UI" scope in the
> [project plan](../PROJECT_PLAN.md) and [Decisions](DECISIONS.md) D06/D12.
> Nothing here is a confirmed decision yet.

One browser console that shows **what the backend knows right now and why**:
users, their subscriptions and grants, the derived access, processing markers,
the outbox, and the queues. It works against the local Compose stack and against
a deployed AWS development stage, with the same pages. Every write goes through
the shared processing path. It is a lens for learners and operators of the
demo, not an admin platform.

## Goals and non-goals

| In scope                                                                         | Not in scope                                                                         |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Two targets: the local Compose stack and the deployed `PremiumPassDev` stack     | Production stages; a public hosted console with write access                         |
| One operator per running console; a shared password guards the browser tab      | A login page, sessions, an Auth0 admin role, admin user management                   |
| Read every record type, explain derived access and processing state              | Editing or deleting raw records; [DynamoDB Admin](DEVELOPMENT.md) on :8001 does that |
| Actions that reuse shared processing code, with a preview before each write      | Provider-side changes such as Stripe refunds or cancelling on a user's behalf        |
| Reload or optional meta refresh                                                  | Live push updates, websockets, a client-side app                                     |

The difference to DynamoDB Admin: that tool shows raw items and lets you edit
them, bypassing every guarantee. The console shows domain views (stored versus
computed access, revision chains, completion state) and writes only through the
shared transactions.

## Decision proposal

| ID  | Proposed decision                                    | Reason / consequence                                                                                                                                                                                                   |
| --- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D14 | Admin console as its own service with explicit targets | Runs on the operator's machine against local Compose or a deployed AWS stage; AWS through the operator's own profile, account-checked, resources from stack outputs; no Auth0 admin role, no admin route in the API |

If approved: D06 stays true (one console, not a platform). D12 keeps its rule
that there is no Auth0 admin role and no public admin endpoint. Its trust
boundary becomes "access to the target's data": the local machine for Compose,
the operator's IAM permissions for AWS. The project plan's scope row for
complimentary Premium loses "no additional admin UI". The CLI keeps its
guarantee that it never targets AWS.

## Targets

The console always runs on the operator's machine ("operator mode"). Against
AWS it uses the operator's own AWS credentials. **IAM, not the password, is the
real boundary there**, and the audit names a real identity.

| Target  | Started with               | Resources                                                                                                                | Credentials                                                        | Audit actor                           |
| ------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ | ------------------------------------- |
| `local` | `pnpm admin`               | Fixed Compose endpoints: `premiumpass-local`, the ElasticMQ work, event, and dead-letter queues                          | Dummy local credentials, like the CLI                              | `<OS user> via admin console`         |
| `aws`   | `pnpm admin --target aws`  | Outputs of stack `PremiumPassDev`: `TableName`, `SubscriptionQueueUrl`, `SubscriptionDlqUrl`, `ReconciliationDlqUrl`     | `AWS_PROFILE`, `AWS_REGION`, `AWS_ACCOUNT_ID`, as for the deploy wrapper | `<caller ARN> via admin console` |

Start rules for the AWS target, in this order:

1. **Account check:** STS `GetCallerIdentity` must return `AWS_ACCOUNT_ID`;
   otherwise the console refuses to start before reading any data.
2. **Resources from the stack only:** names and URLs come from the CloudFormation
   outputs of `PremiumPassDev` in `AWS_REGION`. No table names, queue URLs, or
   endpoint overrides are typed by hand, so the console cannot point at the
   wrong table by accident.
3. **Credentials stay in the server process:** the SDK loads the named profile.
   Keys never reach the browser, the pages, or the logs.

Every page shows the target in the header: local in green, AWS in amber with
account, region, stack, and caller. On AWS each apply button names the target
("Apply on AWS PremiumPassDev").

### What each target can do

The AWS column follows what the stack actually wires
([what runs where](ARCHITECTURE.md#what-runs-where)). The console does not
pretend a missing component exists.

| Capability                      | Local                                    | AWS                                                                                                      |
| ------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| All read views                  | ✓                                        | ✓                                                                                                        |
| Queue depths                    | Work queue, event queue, both DLQs       | Work queue, worker DLQ, reconciliation failure queue; there is no event queue                            |
| Outbox                          | Pending → sent through the publisher     | Entries stay pending: the stack deploys no publisher yet (P08). Shown as info, not as a fault            |
| Complimentary Premium           | ✓                                        | ✓ with the operator's write permission                                                                   |
| Refresh known subscriptions     | ✓ processed by the local worker          | ✓ processed by the worker Lambda                                                                         |
| Expiration check                | ✓                                        | Not offered: expiration jobs are [local-only](RECONCILIATION.md); the API enforces expiry anyway         |
| DLQ redrive                     | Receive, send to the work queue, delete  | SQS message move task from the worker DLQ                                                                |
| Event consumer                  | Outside the console: `pnpm dev:events`   | Not deployed                                                                                             |

### Operator permissions on AWS

The console can do whatever the profile allows. In a development account that
is often an administrator role, which works but grants far more than needed. An
opt-in managed policy in the stack would describe the least privilege an
operator role needs:

- **Read:** `dynamodb:Scan`, `GetItem`, `Query` on the table;
  `cloudformation:DescribeStacks` on the stack; `sqs:GetQueueAttributes` on the
  three queues.
- **Write:** the admin-grant transaction limited to `USER#*` and `OUTBOX#*` keys,
  like the worker role's key-prefix conditions; `sqs:SendMessage` on the work
  queue; receive, delete, and message-move rights on the worker DLQ.

IAM cannot hide fields from a `Scan`: an operator who may scan also reads the
private Google purchase tokens. The console never renders them; the
[AWS boundaries](../infra/README.md#resources-and-boundaries) still apply to
every other role unchanged.

## Placement and runtime

| Option                                                                  | Advantages                                                                                                       | Drawbacks                                                                                           |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **A (recommended):** new workspace `services/admin-console`             | Hono composition that runs on Node and, if ever needed, Lambda (D07); imports only shared packages; CLI unchanged | One more workspace                                                                                  |
| B: `pnpm cli admin` subcommand in `apps/cli`                            | Reuses CLI functions directly                                                                                    | The CLI guarantees it never targets AWS; an AWS target would break that, and there is no Lambda path |
| C: React/Vite app with a JSON API                                       | Same UI kit as the website                                                                                       | Two runtimes, API contracts, CORS, and a second origin to protect on AWS                             |
| D: admin routes in `services/api` with an Auth0 admin role              | Path to a hosted admin                                                                                           | Contradicts D12, needs a role design, adds a public attack surface                                   |

The console is an HTTP backend with runtime entries, so it follows the service
convention; operator mode is its local entry. It needs no CLI code: admin grants
come from `@premiumpass/subscription-processing/admin-grants`, refresh jobs use
the schemas in `@premiumpass/billing-contracts`, access comes from
`@premiumpass/domain`, and clients from `@premiumpass/aws-clients`. The
local-only demo tools (`stripe-sync`, `seed`, `set`) stay in the CLI.

- **Rendering:** Hono with server-side JSX (`hono/jsx`), plain HTML forms, and
  Post/Redirect/Get. No client bundle, no API contracts, no CORS.
- **Look:** one CSS file with the website's color tokens
  ([`style.css`](../apps/web/src/style.css)), Geist, IDs in a monospace font.
- **Freshness:** every page load reads current state; `?refresh=5` adds a meta
  refresh, for example to watch an outbox entry change from pending to sent.
- **Start:** `pnpm admin` on `http://127.0.0.1:3006`, next to the webhook router
  on 3005; DynamoDB Admin keeps 8001. Not part of `pnpm dev` at first.

Proposed code layout:

```text
services/admin-console/src/
  app.ts          Hono app: password, host and origin checks, routes
  local.ts        Node entry: read --target, run the start rules, bind 127.0.0.1
  targets/
    local.ts      fixed Compose endpoints and queue names
    aws.ts        account check, stack outputs, caller identity, capabilities
  snapshot.ts     one consistent table scan, classified into typed records
  checks.ts       consistency checks: pure functions with an injected clock
  queues.ts       queue attributes, DLQ peek and redrive
  actions.ts      admin grants and refresh jobs through shared packages
  pages/          Overview, Users, UserDetail, Outbox, Processing
  style.css
```

A target is one small object: table name, DynamoDB and SQS clients, queue URLs,
the actor label, and the capability list. Pages and actions read capabilities
instead of checking the target name, so a missing component on AWS is one
`false`, not a branch in every page.

## Optional hosted variant

A console reachable by URL in AWS, without starting anything locally. This is
**not part of D14** and needs its own decision.

- **Shape:** `lambda.ts` in the same service, an explicit Gateway route
  `ANY /admin/{proxy+}` (explicit routes take precedence over the default API
  integration, D10), and an opt-in stack parameter `AdminConsoleEnabled=false`.
- **Read-only by design:** the hosted build registers no write routes and gets a
  role with read rights only. The password lives in Secrets Manager; Basic
  authentication over HTTPS; Gateway throttling on the route.
- **Why no writes behind a password:** a shared password on a public URL could
  grant Premium to anyone and names nobody in the audit. Hosted writes need
  individual admin identities, for example an Auth0 login with an admin
  permission and a session: the own login this proposal defers.
- **If the password leaks:** synthetic user IDs, Auth0 subjects, and
  subscription states become readable; no tokens, no writes.
- **Cost:** one Lambda and one secret; no other resources.

## Access protection

The password is a speed bump for the browser tab, not an identity system.

- **Password:** `ADMIN_CONSOLE_PASSWORD` in `config/.env`, synced only to
  `services/admin-console/.env`. The server refuses to start without one or with
  fewer than 16 characters; there is no default (fail closed).
- **HTTP Basic authentication** with Hono's `basicAuth` middleware, which
  compares in constant time. No login page or session store; the browser keeps
  the credentials until it closes.
- **Bind to 127.0.0.1** and reject any `Host` other than `127.0.0.1:3006` or
  `localhost:3006`, so a rebinding DNS name cannot reach the console.
- **Writes only by POST behind Hono's `csrf()` origin check.** Browsers send
  Basic credentials automatically, so without it any open web page could submit
  a form. With the AWS target the local server holds AWS credentials; the
  origin check is what keeps a foreign page from using them.
- No CORS headers, `Cache-Control: no-store`, and neither the password nor AWS
  credentials appear in logs.
- **Audit actor** from the target, set by the server; forms cannot supply one,
  the same rule as `changePremium` in the CLI.

A production admin would need decisions this proposal does not make: individual
admin identities, authorization per action, tamper-resistant audit storage, and
read models instead of scans.

## Data loading

- **One scan per page load.** A paginated, consistent `Scan` of the target's
  table, then classification by key pattern with the existing Zod schemas.
  Invalid or unknown records are counted and listed, never dropped.
- **Why a scan is acceptable here:** user requests never scan, but background
  tools already do (outbox publisher, reconciliation discovery). The demo table
  is small and on-demand, so a scan per page costs fractions of a cent on AWS. A
  production admin would add indexes or a read model, for example outbox entries
  by status and markers by user.
- **One clock per request.** Derived access uses the domain's
  `deriveEntitlements(subscriptions, now, adminGrant)` with a single `now`,
  shown in the page header, so every number on a page refers to the same moment.
- **Queues:** `GetQueueAttributes` for the target's queues (see the table above).
- **Never shown:** Google purchase tokens (only the digest reference), provider
  credentials (only "configured: yes/no"), AWS credentials, checkout URLs (not
  stored anyway). Internal IDs, Auth0 issuer/subject, and Stripe test IDs are
  shown; all data is synthetic.

| View        | Records ([data model](DYNAMODB_DATA_MODEL.md))                                                                                         |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Users       | `USER#U / PROFILE`, `IDENTITY#H / MAP`, `ENTITLEMENTS`, `SUB#…` with owner binding (`PROVIDER#…#SUB#… / OWNER`), `ADMIN_GRANT#premium` |
| User detail | The above plus `ADMIN_AUDIT#…`, `CUSTOMER#stripe`, `CHECKOUT#…`, markers, outbox by user                                               |
| Outbox      | `OUTBOX#U:R / EVENT` and the marker with the same correlation ID                                                                       |
| Processing  | `EVENT#… / PROCESSED`, queue attributes, DLQ messages                                                                                  |

## Views

| Page        | Answers                                                          | Content                                                                                                                                                                         |
| ----------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overview    | Is the system healthy, and what happened last?                   | Counts, consistency checks, the pipeline from webhook to consumer with live counts, target capabilities, recent activity                                                        |
| Users       | Who has access right now, from which source, and what ends next? | Users: search by user ID, Auth0 subject, or provider ID; access now, sources, snapshot drift, last activity. Below: all `SUB#` records sorted by access end, with owner binding |
| User detail | Why does this user have exactly this access?                     | Access explained step by step, stored snapshot versus computed now, subscriptions, admin grant and audit, checkouts, revision timeline, actions                                 |
| Outbox      | Has every committed change been announced?                       | Pending, sent, and invalid entries; age; the change (for example free → premium); trigger; lifecycle of one entry                                                               |
| Processing  | What did the worker do, and is anything stuck?                   | Queue depths, DLQ messages, processing markers with outcome and store completion, reconciliation activity                                                                       |

**Revision timeline (user detail).** Each aggregate revision is one row: the
marker that caused it, the outbox entry (if any), and the resulting tier. A
revision without an outbox entry is labelled "verified, access unchanged",
because a verification without changes updates the aggregate but adds no event.
This makes gaps in the outbox sequence explainable instead of alarming.

**Inline explanations.** Each section has one sentence on what the record means
and a link to its owning guide, so the console doubles as a map of the docs.
Every record has a collapsed "raw item" view with `pk`/`sk`.

## Consistency checks

Pure functions over the snapshot, the target's capabilities, and `now`; each
result links to the affected records. They mirror the review risks in
[AGENTS.md](../AGENTS.md#code-review-rules).

| Check                     | Rule                                                                                              | Severity | Suggested action                                            |
| ------------------------- | ------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------- |
| Owner binding mismatch    | `PROVIDER#…#SUB#S / OWNER` names a different user than the `SUB#` record's owner                  | Critical | Investigate; no automatic repair                            |
| Snapshot drift            | Stored `ENTITLEMENTS` tier or `effectiveUntil` differs from `deriveEntitlements(now)`             | Warning  | Local: run the expiration check. AWS: none; the API enforces |
| Outbox waiting            | Pending entry older than 60 seconds while a publisher exists for the target                       | Warning  | Start the publisher (`pnpm dev:outbox`)                     |
| Outbox not published      | Pending entries on a target without a publisher                                                   | Info     | Expected on AWS until P08                                   |
| Invalid records           | A record fails its schema (subscription, snapshot, outbox)                                        | Warning  | Inspect the raw item                                        |
| Store completion pending  | Apple marker without `finishedAt`, or Google marker needing acknowledgement without `completedAt` | Warning  | Wait for the worker retry; check its log                    |
| Dead-letter messages      | Any DLQ or the reconciliation failure queue is not empty                                          | Warning  | Inspect, then redrive                                       |
| Subscription not verified | Provider subscription without owner binding and without `demoScenario`                            | Info     | Created by a CLI demo override                              |

## Actions

Every write follows the same pattern: form → preview (dry run, no writes) →
apply with the same request ID → result page that says what changed and what to
check next. Request IDs are generated when the form renders, so a double submit
replays the receipt instead of writing twice.

| Action                                | Shared code path                                                                                    | Local | AWS | Phase |
| ------------------------------------- | --------------------------------------------------------------------------------------------------- | ----- | --- | ----- |
| Grant or change complimentary Premium | `changeAdminGrant` and `DynamoDbAdminGrantStore` from `/admin-grants`, actor from the target        | ✓     | ✓   | 2 / 3 |
| Revoke complimentary Premium          | Same                                                                                                | ✓     | ✓   | 2 / 3 |
| Refresh one user                      | One reconciliation job per stored subscription (`billing-contracts` schemas); the worker verifies | ✓     | ✓   | 2 / 3 |
| Refresh all users                     | Same, for every stored subscription                                                                 | ✓     | ✓   | 2 / 3 |
| Expiration check                      | Expiration job for one user                                                                         | ✓     | —   | 2     |
| Redrive the work DLQ                  | Move messages back to the work queue; jobs carry references only                                    | ✓     | ✓   | 2 / 3 |

**Refresh, not discovery.** The console builds jobs from references it already
has: Stripe subscription ID and expected owner, Apple original transaction ID,
Google package and purchase token (read on the server, never rendered). The
worker then reads current provider state, so the console holds no provider
keys. Finding subscriptions that were never stored (T21) stays with
`pnpm cli reconcile` locally and the discovery Lambdas on AWS.

Not offered: publishing the outbox (the publisher stays a separate process),
the CLI's local demo overrides, editing or deleting records, and anything that
changes provider state. Redrive is safe because the worker skips completed jobs
through its markers; that is the same idempotency the
[retry loop](PAYMENTS.md#processing-and-retries) relies on.

## Phases

1. **Read-only console, local target.** Server, protection, target object,
   snapshot loader, the five pages, consistency checks.
2. **Actions, local target**, with preview and request IDs.
3. **AWS target in operator mode.** Start rules, stack outputs, caller actor,
   capabilities; optionally the operator policy in CDK.
4. **Optional:** hosted read-only variant (separate decision); `pnpm dev`
   integration; links from the Try it out guides.

## Manual verification

There are no automated tests ([D08](DECISIONS.md)). Keep local, synthesis, and
live AWS evidence apart.

- **Local:** `pnpm check` passes. Without a password: refused. Wrong password:
  401. `Host: evil.test`: rejected. A cross-origin POST: rejected. The user
  detail matches `pnpm cli list` and DynamoDB Admin. A Stripe test purchase
  shows marker, snapshot revision, and a pending outbox entry that turns sent
  once the publisher runs. Grant and revoke show audit and outbox entries.
- **AWS start rules:** a wrong `AWS_ACCOUNT_ID` or a missing stack is refused
  before any table read.
- **Synthesis (if the operator policy is added):** `pnpm infra:synth` and an
  inspection of the generated policy.
- **Live AWS, only with authorization:** pages match the deployed table; a grant
  records the caller ARN; a refresh job is processed by the worker Lambda; a DLQ
  redrive returns the message to the work queue.

## Open questions

1. Approve D14: a separate service with local and AWS targets in operator mode?
2. The hosted read-only variant: wanted at all, and if so, in phase 4?
3. Expiration on AWS: let the worker write `EVENT#local_expiration#*` markers (a
   stack change), or keep expiration local-only as today?
4. Add the operator policy to the stack, or rely on existing profiles?
5. Start the console with `pnpm dev`, or separately as proposed?

## Documents to update when implemented

[Decisions](DECISIONS.md) (D14, D12 wording), [project plan](../PROJECT_PLAN.md)
scope row, [Architecture](ARCHITECTURE.md) (component and what runs where),
[Development](DEVELOPMENT.md) (command and password),
[AWS setup](setup/aws.md) (AWS target), [Tasks](TASKS.md) (new task),
`config/targets.mjs` for the new settings, and the infra README if the operator
policy lands. This page then becomes the console's guide and joins the docs site.
