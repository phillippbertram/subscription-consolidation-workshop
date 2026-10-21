# Development

Complete the [local setup](setup/README.md) once. This guide covers everyday
work, local diagnostics, and cleanup. Commands run from the repository root.

## Run and check

Run `pnpm run` to list all root scripts. Names follow these groups:
`dev:*` for long-running development processes, `local:*` for Docker,
`mobile:*` for native builds, `cli` for all local subscription tools,
`webhooks:listen` for provider forwarding, `infra:*` for CDK, and `docs:*`
for the documentation site.
Standard checks keep their short names.
Additional arguments follow the command directly, for example
`pnpm cli reconcile --provider google --dry-run`.

### Development processes

| Command                                              | Starts                                                                                      |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `pnpm dev`                                           | Docker + table, then API, Stripe/Apple/Google webhooks, worker, Web, reconciliation watcher |
| `pnpm dev:api` / `pnpm dev:api:lan`                  | API on loopback / on all interfaces (for a phone on the LAN)                                |
| `pnpm dev:web`                                       | Website only                                                                                |
| `pnpm dev:mobile` / `pnpm dev:mobile:lan`            | Metro for the development app ([device setup](setup/apple.md#run-on-a-physical-iphone))     |
| `pnpm dev:webhook:stripe` / `pnpm dev:webhook:apple` | One webhook process                                                                         |
| `pnpm dev:webhook:google`                            | Google Pub/Sub webhook on port 3004                                                         |
| `pnpm dev:worker`                                    | Subscription queue worker                                                                   |
| `pnpm dev:outbox` / `pnpm dev:events`                | Outbox publisher (repeating) / its log consumer                                             |
| `pnpm cli reconcile --watch`                         | Reconciliation watcher, only when not using `pnpm dev`                                      |

- Use either `pnpm dev` or individual processes, not both.
- Metro, outbox publisher, and log consumer always start separately. The Google
  webhook starts with `pnpm dev`; while `GOOGLE_PLAY_ENABLED` is not `true` it
  answers `503 google_not_configured`.
- After changing `config/.env`, run `pnpm config:sync` and restart the affected
  processes; `pnpm dev` syncs on every start.

### Configuration

`config/.env` (ignored) is the only file to edit. `pnpm config:sync` writes the
`.env` file of every app and service from it. Each program receives only the
settings listed for it in [config/targets.mjs](../config/targets.mjs), so a
secret such as the Google service-account key reaches only the worker and the
CLI. The programs keep reading their own `.env` as before.

| Command              | Does                                                                                                              |
| -------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `pnpm config:sync`   | Validate `config/.env` and write all generated `.env` files; run by `pnpm dev`, the mobile and the deploy scripts |
| `pnpm config:check`  | Validate `config/.env` and report generated files that are missing, outdated, or edited by hand                   |
| `pnpm config:import` | Build `config/.env` once from existing per-service `.env` files; reports conflicts by file name                   |

- **Generated files are not edited.** Each one records a hash of its content.
  If a file was changed by hand, or holds values that `config/.env` does not,
  the sync keeps it and names the differing settings; `--force` overwrites it.
- **Validation stops early** on what would otherwise fail later: a provider
  enabled without its settings, a missing key file, a live Stripe key, or a
  push subscription given as a bare ID. Output names settings, never values.
- **Shell variables still win**, so `pnpm dev:api:lan` can set `HOST`.
- **Adding a setting:** put it into `config/.env.example` with a comment, map
  it in `config/targets.mjs` for every program that reads it, then sync.

### Local tools

| Command                                       | Purpose                                                               |
| --------------------------------------------- | --------------------------------------------------------------------- |
| `pnpm local:up` / `pnpm local:down`           | Start/initialize or remove Compose containers; retain database volume |
| `pnpm local:logs`                             | Show the last 100 lines of Docker logs                                |
| `pnpm cli --help`                             | Inspect or change local subscriptions for one user                    |
| `pnpm cli seed <internal-user-id> <scenario>` | Seed reserved synthetic demo records                                  |
| `pnpm cli reconcile --dry-run`                | Preview queued reconciliation; omit `--dry-run` to enqueue            |
| `pnpm outbox:publish --dry-run`               | Preview pending outbox events; omit `--dry-run` to publish one pass   |
| `pnpm stripe:listen`                          | Forward Stripe test events in a separate CLI terminal                 |
| `pnpm webhooks:listen`                        | Stripe listener + one ngrok HTTPS tunnel for Apple and Google         |

### Receive provider webhooks together

After installing and logging into the [Stripe CLI](setup/stripe.md#1-create-the-product-keys-and-listener)
and configuring [ngrok](setup/apple.md#receive-apple-notifications-through-ngrok),
run in a separate terminal:

```sh
pnpm webhooks:listen
```

This starts the existing Stripe test listener and ngrok in parallel. A local
router on `127.0.0.1:3005` shares one public HTTPS origin between the two store
receivers. ngrok prints the origin in its startup output; append each path:

| Provider | Public destination                           | Local receiver   |
| -------- | -------------------------------------------- | ---------------- |
| Stripe   | Stripe CLI forwarding; no public URL needed  | `127.0.0.1:3002` |
| Apple    | `https://YOUR_NGROK_HOST/v1/webhooks/apple`  | `127.0.0.1:3003` |
| Google   | `https://YOUR_NGROK_HOST/v1/webhooks/google` | `127.0.0.1:3004` |

Keep `pnpm dev` running for the receivers and worker, including the Google
receiver. This command only starts forwarding; it does not enable providers or register their destinations. Store
the Stripe listener's signing secret as `STRIPE_WEBHOOK_SECRET` in
`config/.env` and run `pnpm config:sync`.
Register the Apple Sandbox URL and Google's Pub/Sub endpoint/audience following
the provider guides. Update those values if the public origin changes.

Only the two exact Apple/Google POST paths are exposed. Bodies and authentication
headers pass through to the existing verifying services. Other paths return 404;
an offline receiver returns 502 so delivery can retry. `Ctrl+C` stops the listener,
tunnel, and router together; if either child exits, the other is stopped too.
Use this command instead of a separate `pnpm stripe:listen` or ngrok process.

### Builds and checks

| Command                                                   | Purpose                                                                                  |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `pnpm format` / `pnpm check`                              | Fix lint and formatting / verify formatting, lint, types, and builds                     |
| `pnpm format:check` / `pnpm lint` / `pnpm typecheck`      | One check on its own                                                                     |
| `pnpm lint:fix`                                           | ESLint fixes only                                                                        |
| `pnpm build` / `pnpm start:api`                           | Build all workspaces / start the built local API                                         |
| `pnpm mobile:ios` / `pnpm mobile:android`                 | Build and install the native development app                                             |
| `pnpm mobile:android:doctor`                              | Check JDK (17-21) and Android SDK prerequisites                                          |
| `pnpm mobile:android:aab` (`--unsigned`)                  | Signed Play upload / unsigned test bundle ([setup](setup/google.md#local-android-build)) |
| `pnpm infra:synth`                                        | Produce the CDK template locally, without AWS calls                                      |
| `pnpm infra:bootstrap:dev` / `pnpm infra:deploy:dev`      | Prepare / deploy AWS development resources ([AWS guide](setup/aws.md#deploy))            |
| `pnpm docs:dev` / `pnpm docs:build` / `pnpm docs:preview` | Documentation site on port 5174 / static build / serve the build on port 4174            |

- `pnpm build` bundles backends, builds Web, exports Mobile JavaScript, and
  builds the documentation site; it does not compile native apps. There is no
  automated test suite.
- The documentation site ([`apps/docs`](../apps/docs/.vitepress/config.ts))
  renders `docs/` in place. Its build fails on a relative link to a file that
  does not exist; links to source code and to files outside `docs/` open on
  GitHub. Add a new page to the sidebar in that config file. Colors and fonts
  live in [`theme/brand.css`](../apps/docs/.vitepress/theme/brand.css).
- The [docs workflow](../.github/workflows/docs.yml) builds the site for every
  pull request and push, and publishes `main` to
  [GitHub Pages](https://phillippbertram.github.io/subscription-consolidation-workshop/).
  It needs Pages enabled once under Settings → Pages → Source: GitHub Actions.
- Format scripts skip Markdown. For a changed Markdown file, run
  `pnpm exec prettier --write path/to/file.md` and check its links and diagrams.

## Inspect and debug

| Surface                               | Address or command                                                    |
| ------------------------------------- | --------------------------------------------------------------------- |
| API / Stripe / Apple / Google ingress | Ports 3000 / 3002 / 3003 / 3004                                       |
| Shared webhook tunnel router          | `127.0.0.1:3005`, started by `pnpm webhooks:listen`                   |
| Website                               | `http://localhost:5173`                                               |
| DynamoDB Admin                        | `http://127.0.0.1:8001` → `premiumpass-local`                         |
| Docker logs                           | `pnpm local:logs` or append `dynamodb`, `dynamodb-admin`, `elasticmq` |
| Raw API logs                          | `pnpm dev:api`; grouped startup adds process labels                   |
| Mobile API logs                       | Open React Native DevTools with `j` in Metro                          |

Pino writes JSON logs with request IDs. Match `X-Request-Id` from the API response
with `serverRequestId` in Mobile. For billing, follow `correlationId` and provider
event IDs from ingress through `subscription.processed`.

Local API logging defaults to `debug`: bounded body/query previews and unexpected
error details are visible. Billing routes always omit payloads. `LOG_LEVEL=info`
omits previews; `warn`, `error`, and `silent` reduce logging further. Headers and
tokens are not automatically logged; use synthetic request data only.

### Follow a provider event through the logs

The three webhooks and the worker log one JSON line per step, all at `info` or
above. Search the output of `pnpm dev` for one `correlationId` to see an event
from the provider's call to the committed result. Lines at the same step share
fields across providers, so the table applies to Stripe, Apple, and Google.

| Log event                                                                         | Level   | Meaning                                                                                                                                                                                                          |
| --------------------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `webhook.received`, `apple.notification_received`, `google.notification_received` | `info`  | A verified provider event, with a safe summary of what it says (type, IDs, status, dates)                                                                                                                        |
| `webhook.queued`, `apple.notification_queued`, `google.notification_queued`       | `info`  | The queue accepted the job and the provider got its 200                                                                                                                                                          |
| `webhook.ignored`, `apple.notification_ignored`, `google.notification_ignored`    | `info`  | Verified, but nothing to do. `reason` says why (unhandled event type, TEST, another product)                                                                                                                     |
| `webhook.rejected`, `apple.notification_rejected`, `google.notification_rejected` | `warn`  | The webhook answered with an error. `code` or `reason` names the cause, for example `invalid_push_identity`                                                                                                      |
| `subscription.received`                                                           | `info`  | The worker took a job: `queueLagMs`, `receiveCount` (above 1 means a retry), and the job's IDs                                                                                                                   |
| `subscription.processed`                                                          | `info`  | `outcome` (`changed`, `verified`, `duplicate`), `durationMs`, the resulting `subscription` (state, `accessUntil`, revision), and for Google the `orderId` (`GPA.…`) shown in the Play Console's Order management |
| `subscription.failed`, `subscription.invalid_job`                                 | `error` | Processing failed with a `code`, or the message was not a valid job. The queue retries, and `issues` lists the fields that did not match                                                                         |

The summaries are allowlists, not payloads. `pickFields` in
`packages/logging` copies only plain fields that a service names in its
`log-summary.ts`, so a field the provider adds later stays out of the logs until
someone chooses to show it. Signed Apple payloads, purchase tokens, customer
details, and amounts are never logged: a Google subscription is shown as the
digest that also names it in the database. Raw payloads are deliberately not
logged, because logs must not contain full payment payloads.

| Problem                                 | First check                                                                               |
| --------------------------------------- | ----------------------------------------------------------------------------------------- |
| Port already used                       | Stop the older process using the same service port                                        |
| Profile fails but health succeeds       | Docker/table configuration; health does not check dependencies                            |
| Login, 401, or scope error              | [Auth0 troubleshooting](setup/auth0.md#troubleshooting)                                   |
| Checkout succeeds but access stays Free | [Payment checks](PAYMENTS.md#manual-checks)                                               |
| iPhone cannot reach API                 | API LAN binding, device permission, and Mac address; not phone localhost                  |
| Apple notification fails                | [ngrok and notification checks](setup/apple.md#receive-apple-notifications-through-ngrok) |

## Local outbox

Start `pnpm dev:events` in one terminal and `pnpm dev:outbox` in another after
`pnpm local:up`. These services are separate from `pnpm dev`. No Apple, Stripe,
or AWS credentials are needed. The publisher reads the fixed local table and
creates a separate ElasticMQ event queue/DLQ on demand.

Use `pnpm outbox:publish --dry-run` to preview pending IDs without writes, then
`pnpm outbox:publish` for one pass. Match `domainEventId` in `outbox.sent` and
`subscription.changed` logs. Failed entries remain pending; a one-pass failure
returns a nonzero exit code. Consumer failure does not undo publication or access.

ElasticMQ is a local transport substitute, not EventBridge. Accepted messages
are lost on container restart even if the outbox is already marked sent. Keep
the broker running during verification. [Publisher behavior and cloud boundary](../services/outbox-publisher/README.md).

## Local subscription CLI

`pnpm cli` is the single entry for all local subscription tools
([CLI workspace](../apps/cli/README.md)). Copy the internal user UUID from the
Web account details or Mobile developer tools; the user must have signed in once.

```sh
pnpm cli                                 # interactive; asks for the user ID
pnpm cli <internal-user-id>               # interactive for this user
pnpm cli list <internal-user-id>
pnpm cli stripe-sync <internal-user-id> --dry-run
pnpm cli stripe-sync <internal-user-id>
pnpm cli set <internal-user-id> free
pnpm cli set <internal-user-id> active --subscription <provider-subscription-id>
pnpm cli --help
```

| Operation                 | Effect                                                                                                |
| ------------------------- | ----------------------------------------------------------------------------------------------------- |
| `set … free`              | Expire existing local subscriptions and clear grace; does not cancel provider contracts               |
| `set … active`            | Give existing known-product records one hour of local access; `--until` accepts a future UTC boundary |
| `set … expiring`          | Give existing records 30 seconds of local access                                                      |
| `--subscription <id>`     | Limit `set` to one subscription; otherwise all existing records, including Stripe/Apple, are changed  |
| `stripe-sync … --dry-run` | Read current Stripe test state and preview differences without database writes                        |
| `stripe-sync …`           | Restore local Stripe records through the worker processor; preserve other providers                   |

- **Target:** every CLI write goes to the fixed local Compose database, never AWS.
- **Credentials:** `list`, `set`, `seed`, and `premium` need none. Provider
  commands read shell variables, then `apps/cli/.env`, which `pnpm config:sync`
  generates from `config/.env`; the worker's `.env` is not loaded.
- **`stripe-sync`** needs a Stripe test key/price and an existing customer
  mapping, but no worker. It never changes Stripe; partial failures exit nonzero.
- **`seed <user-id> <scenario>`** changes only two reserved demo records
  (scenarios such as `active`, `expiring`, `multiple`, `grace`; `free` removes
  them). Real provider grants stay untouched.
  [Several sources at once](try-it/several-sources.md) walks through the
  scenarios.

### Complimentary Premium

Give an existing user Premium without any provider subscription:

```sh
pnpm cli premium grant <internal-user-id> --forever --reason "Demo access"
pnpm cli premium grant <internal-user-id> --until 2026-12-01T12:00:00Z --reason "Workshop access"
pnpm cli premium list <internal-user-id>
pnpm cli premium revoke <internal-user-id> --reason "Workshop ended"
```

| Rule              | Detail                                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------------------ |
| Expiry            | Exactly one of `--forever` or a future UTC `--until`; granting again updates the one grant                   |
| Revoke            | Ends only this grant; a valid paid subscription still gives Premium                                          |
| Preview and retry | `--dry-run` writes nothing. Retry an uncertain result with the printed `--request-id` and the same arguments |
| Audit             | A reason is required; the OS user is recorded automatically. Never enter secrets                             |
| `premium list`    | Current access, the stored grant, and its audit history                                                      |
| Clients           | Web/Mobile show “Complimentary Premium” separately, without a manage action                                  |

- **Trust boundary:** whoever can use the local database can grant Premium.
  There is no Auth0 admin role and no HTTP admin route; a hosted version would
  need both. This is a developer tool, not a multi-user admin system.
- Reconciliation and the `set`/`seed` demo commands never change this grant.
  Step by step: [Complimentary Premium](try-it/complimentary-premium.md).

## Local reconciliation and expiration

What reconciliation does and why: [Reconciliation](RECONCILIATION.md). This
section lists the commands.

| Command                          | Effect                                                        |
| -------------------------------- | ------------------------------------------------------------- |
| `pnpm cli reconcile --dry-run`   | Preview differences for all users; no writes, no queued jobs  |
| `pnpm cli reconcile`             | Queue refresh and due expiration jobs for the worker          |
| `pnpm cli reconcile --watch`     | Run now, then every five minutes (already part of `pnpm dev`) |
| `pnpm cli stripe-sync <user-id>` | Repair Stripe directly, without the queue                     |

| Option                      | Effect                                                         |
| --------------------------- | -------------------------------------------------------------- |
| `--user <internal-user-id>` | Only this user                                                 |
| `--provider all`            | Default: Stripe test and known Apple/Google test subscriptions |
| `--provider stripe`         | Stripe test only                                               |
| `--provider apple`          | Known Apple Sandbox subscriptions only                         |
| `--provider google`         | Known Google Play license-test tokens; needs Google settings   |
| `--provider none`           | Expiration only; no provider keys                              |

- Queued jobs need a running worker (`pnpm dev` or `pnpm dev:worker`).
- Every run also checks expiration. The API enforces expiry on its own; the job
  only refreshes the stored snapshot and announces the change.
- Provider credentials load only when a matching subscription exists. Stripe
  needs `STRIPE_SECRET_KEY` (test) and `STRIPE_PRODUCT_ID`; Apple needs the
  [Apple settings](setup/apple.md#local-reconciliation).
- Logs and exit codes: [Follow a run](RECONCILIATION.md#follow-a-run).

### Repair a missed Stripe event (T20)

Needs a Stripe test subscription bought on the website. Stop `pnpm stripe:listen`
first, so the next Stripe event never reaches the local webhook. Then cancel the
subscription in the Stripe Dashboard (test mode), or with the Stripe CLI:

```sh
pnpm cli list <internal-user-id>   # shows the sub_… ID
stripe subscriptions cancel sub_…
pnpm cli reconcile --user <internal-user-id> --provider stripe --dry-run
pnpm cli reconcile --user <internal-user-id> --provider stripe
```

The cancellation changed only Stripe. Access stays stale until reconciliation
repairs it; repeating the last command adds no second outbox event. Start
`pnpm stripe:listen` again afterwards. Guided version with explanations:
[Missed updates and expiry](try-it/missed-updates.md).

**T21 (missed initial Stripe webhook):** the Stripe customer mapping must
already exist. Reconciliation lists all of that customer's test subscriptions,
including ones never stored locally, and the worker verifies them before
granting access. [Recovery guarantees](RECONCILIATION.md#recovery-guarantees).

## Cleanup

Choose the intended result. Local data, provider subscriptions, and AWS resources
have separate lifecycles; deleting one does not delete the others.

### Pause work

1. Stop `pnpm dev`, Metro, and `pnpm webhooks:listen` (or the separate Stripe
   listener and ngrok) with `Ctrl+C` in their
   terminals. Stop any individually launched services too.
2. Leave Docker running to keep in-memory queue messages, or run:

   ```sh
   pnpm local:down
   ```

   This removes this Compose project's containers/network. DynamoDB records
   remain in the named volume; ElasticMQ messages are lost when its container
   stops. Resume with `pnpm dev` and restart the needed listener/tunnel.

3. For a longer Apple pause, [remove the sandbox notification URL](setup/apple.md#cleanup)
   so Apple no longer targets an inactive tunnel. For a longer Google pause,
   [delete the Pub/Sub push subscription](setup/google.md#cleanup) for the same
   reason.

### Reset local data

**Deletes all profiles, customer/owner mappings, subscriptions, markers, and
outbox records in this project's local database,
plus queued work.** It does
not cancel Stripe/Apple subscriptions or delete Auth0 users.

Stop processes first. Inspect the target with `docker compose config --volumes`
and `docker volume inspect premiumpass-local_dynamodb-data`. Then, from this
repository root:

```sh
docker compose down --volumes
pnpm local:up
```

Sign-in now creates a new internal UUID. Old provider purchases retain their
original ownership references and are not automatically reassigned. Use fresh
synthetic purchase accounts for a clean demo; never repair ownership by guessing
or editing another user's mapping.

### Remove external integrations

Use this order when retiring the demo:

1. While processing is still available, end project-specific test subscriptions
   through the [Stripe](setup/stripe.md#cleanup), [Apple](setup/apple.md#cleanup),
   or [Google Play](setup/google.md#cleanup) management flow if that is your intent.
2. Remove project webhook destinations (Stripe endpoint, Apple URL, the Google
   Pub/Sub topic and subscriptions) and stop forwarding/tunnels.
3. Follow [AWS cleanup](setup/aws.md#cleanup) if you deployed resources.
4. Remove dedicated [Auth0 resources](setup/auth0.md#cleanup), revoke only
   project-specific keys, and remove their ignored local files when no longer
   needed. Preserve shared tenants, connections, keys, and developer accounts.
5. Remove the dedicated Google Cloud resources: the backend and push-auth
   service accounts with their JSON key, and the Play Console user for the
   backend account ([Google Play cleanup](setup/google.md#cleanup)). Preserve a
   shared Cloud project, the Play app, and your license-tester list.
6. Sign out of the demo clients. Clear only this site's browser data if desired;
   uninstall the development app if you no longer need it.

No command here removes all external resources automatically. Verify the target
account/environment and each resource before deleting it.
