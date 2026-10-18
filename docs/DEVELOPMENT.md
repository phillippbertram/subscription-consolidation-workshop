# Development

Complete [Getting started](GETTING_STARTED.md) once. This guide covers everyday
work, local diagnostics, and cleanup. Commands run from the repository root.

## Run and check

Run `pnpm run` to list all root scripts. Names follow these groups:
`dev:*` for long-running development processes, `local:*` for Docker,
`mobile:*` for native builds, `subscription:*` for local subscription tools,
and `infra:*` for CDK. Standard checks keep their short names.
Additional arguments follow the command directly, for example
`pnpm subscription:reconcile --provider google --dry-run`.

### Development processes

| Command                                              | Purpose                                                                                                                      |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `pnpm dev`                                           | Initialize Docker/table, then run API, Stripe/Apple webhooks, worker, and Web                                                |
| `pnpm dev:api` / `pnpm dev:api:lan`                  | API on loopback / all IPv4 interfaces                                                                                        |
| `pnpm dev:web`                                       | Website only                                                                                                                 |
| `pnpm dev:mobile` / `pnpm dev:mobile:lan`            | Metro for an installed development app on localhost / LAN; [device setup](../apps/mobile/README.md#run-on-a-physical-iphone) |
| `pnpm dev:webhook:stripe` / `pnpm dev:webhook:apple` | Individual Stripe / Apple ingress                                                                                            |
| `pnpm dev:webhook:google`                            | Authenticated Google Pub/Sub ingress on loopback port 3004                                                                   |
| `pnpm dev:worker`                                    | Subscription queue worker                                                                                                    |
| `pnpm dev:outbox` / `pnpm dev:events`                | Watch local outbox / run its separate log consumer                                                                           |
| `pnpm dev:reconcile`                                 | Repeat local reconciliation every five minutes                                                                               |

Use the grouped stack or its individual processes, not both. Google ingress,
Metro, outbox, event consumption, and reconciliation start separately.
Restart processes after `.env` changes.

### Local tools

| Command                                                | Purpose                                                               |
| ------------------------------------------------------ | --------------------------------------------------------------------- |
| `pnpm local:up` / `pnpm local:down`                    | Start/initialize or remove Compose containers; retain database volume |
| `pnpm local:logs`                                      | Show the last 100 lines of Docker logs                                |
| `pnpm subscription --help`                             | Inspect or change local subscriptions for one user                    |
| `pnpm subscription:seed <internal-user-id> <scenario>` | Seed reserved synthetic demo records                                  |
| `pnpm subscription:google-mock --help`                 | Change independent local Google mock state                            |
| `pnpm subscription:reconcile --dry-run`                | Preview queued reconciliation; omit `--dry-run` to enqueue            |
| `pnpm outbox:publish --dry-run`                        | Preview pending outbox events; omit `--dry-run` to publish one pass   |
| `pnpm stripe:listen`                                   | Forward Stripe test events in a separate CLI terminal                 |

### Builds and checks

| Command                                                          | Purpose                                                                                                      |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `pnpm mobile:ios` / `pnpm mobile:android`                        | Build/install a native development app                                                                       |
| `pnpm mobile:android:doctor`                                     | Check local Java and Android SDK prerequisites                                                               |
| `pnpm mobile:android:aab` / `pnpm mobile:android:aab --unsigned` | Build a signed Play upload / unsigned local verification bundle; [setup](GOOGLE_PLAY.md#local-android-build) |
| `pnpm build` / `pnpm start:api`                                  | Build all workspaces / start the built local API                                                             |
| `pnpm format` / `pnpm check`                                     | Apply lint fixes and formatting / verify formatting, lint, types, and builds                                 |
| `pnpm format:check` / `pnpm lint` / `pnpm typecheck`             | Run an individual check                                                                                      |
| `pnpm lint:fix`                                                  | Apply ESLint fixes only                                                                                      |
| `pnpm infra:synth`                                               | Produce CDK assembly locally                                                                                 |
| `pnpm infra:bootstrap:dev` / `pnpm infra:deploy:dev`             | Bootstrap / deploy AWS development resources; [account setup and dry run](../infra/README.md#deploy)         |

`pnpm build` bundles backend entry points, builds Web, and exports Mobile
JavaScript for iOS and Android; it does not compile native apps.
There is no automated test suite.

The formatting scripts cover code/configuration, not Markdown. For a changed
Markdown file, also run `pnpm exec prettier --write path/to/file.md`, then
`pnpm exec prettier --check path/to/file.md` and check its links/diagrams.

## Inspect and debug

| Surface                              | Address or command                                                    |
| ------------------------------------ | --------------------------------------------------------------------- |
| API / Stripe ingress / Apple ingress | Ports 3000 / 3002 / 3003                                              |
| Website                              | `http://localhost:5173`                                               |
| DynamoDB Admin                       | `http://127.0.0.1:8001` → `premiumpass-local`                         |
| Docker logs                          | `pnpm local:logs` or append `dynamodb`, `dynamodb-admin`, `elasticmq` |
| Raw API logs                         | `pnpm dev:api`; grouped startup adds process labels                   |
| Mobile API logs                      | Open React Native DevTools with `j` in Metro                          |

Pino writes JSON logs with request IDs. Match `X-Request-Id` from the API response
with `serverRequestId` in Mobile. For billing, follow `correlationId` and provider
event IDs from ingress through `subscription.processed`.

Local API logging defaults to `debug`: bounded body/query previews and unexpected
error details are visible. Billing routes always omit payloads. `LOG_LEVEL=info`
omits previews; `warn`, `error`, and `silent` reduce logging further. Headers and
tokens are not automatically logged; use synthetic request data only.

| Problem                                 | First check                                                                                   |
| --------------------------------------- | --------------------------------------------------------------------------------------------- |
| Port already used                       | Stop the older process using the same service port                                            |
| Profile fails but health succeeds       | Docker/table configuration; health does not check dependencies                                |
| Login, 401, or scope error              | [Auth0 troubleshooting](AUTH0_SETUP.md#troubleshooting)                                       |
| Checkout succeeds but access stays Free | [Payment checks](PAYMENTS.md#manual-checks)                                                   |
| iPhone cannot reach API                 | API LAN binding, device permission, and Mac address; not phone localhost                      |
| Apple notification fails                | [ngrok and notification checks](APPLE_PURCHASES.md#receive-apple-notifications-through-ngrok) |

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

The [CLI workspace](../apps/cli/README.md) owns these commands; their root aliases
remain unchanged. Copy the internal user UUID from Web account details or Mobile developer tools.
The profile must already exist in DynamoDB Local.

```sh
pnpm subscription <internal-user-id>
pnpm subscription list <internal-user-id>
pnpm subscription reconcile <internal-user-id> --dry-run
pnpm subscription reconcile <internal-user-id>
pnpm subscription set <internal-user-id> free
pnpm subscription set <internal-user-id> active --subscription <provider-subscription-id>
pnpm subscription --help
```

| Operation               | Effect                                                                                                |
| ----------------------- | ----------------------------------------------------------------------------------------------------- |
| `set … free`            | Expire existing local subscriptions and clear grace; does not cancel provider contracts               |
| `set … active`          | Give existing known-product records one hour of local access; `--until` accepts a future UTC boundary |
| `set … expiring`        | Give existing records 30 seconds of local access                                                      |
| `--subscription <id>`   | Limit `set` to one subscription; otherwise all existing records, including Stripe/Apple, are changed  |
| `reconcile … --dry-run` | Read current Stripe test state and preview differences without database writes                        |
| `reconcile …`           | Restore local Stripe records through the worker processor; preserve other providers                   |

All CLI writes target the fixed Compose database. Provider settings resolve from
shell variables, then optional `apps/cli/.env`, then `services/subscription-worker/.env`
as a fallback for existing setups. See the [CLI example](../apps/cli/.env.example).
Reconciliation needs a Stripe test key/price and an existing Stripe customer mapping, but no running
worker or queue. It discovers missing subscriptions, verifies ownership, and
reports partial failures with a nonzero exit code. It never changes Stripe.
`list`, `set`, and mock seeding need no provider credentials.

For independent mock records, use `pnpm subscription:seed <internal-user-id>
<scenario>` with `active`, `expiring`, `multiple`, or `free`. These scenarios
change only two reserved, marked demo records. `free` removes those records;
it does not remove real provider grants. Refresh the client after changes.

## Local reconciliation and expiration

For the overview, provider differences, processing flow, and failure behavior,
read [Reconciliation](RECONCILIATION.md). This section owns commands and exercises.

The existing `pnpm subscription reconcile <user-id>` performs a synchronous
Stripe-only repair. The following commands instead discover work for one or all
users and send it to the existing subscription queue:

```sh
pnpm local:up
pnpm dev:worker
```

In another terminal:

```sh
pnpm subscription:reconcile --dry-run
pnpm subscription:reconcile
pnpm dev:reconcile
```

The watcher runs immediately, then every five minutes, without overlapping its
own runs. Stop with `Ctrl+C`; these commands are separate from `pnpm dev`.
Follow [run diagnostics](RECONCILIATION.md#follow-a-run) to distinguish queue
acceptance from completed repair.

| Option                      | Effect                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------- |
| `--user <internal-user-id>` | Limit discovery to one existing local profile                                         |
| `--provider all`            | Stripe test, known Apple/Google test subscriptions, and managed Google mocks; default |
| `--provider stripe`         | Stripe test only                                                                      |
| `--provider apple`          | Known Apple Sandbox subscriptions only                                                |
| `--provider google_mock`    | Independent Google mock state only; no provider keys                                  |
| `--provider google`         | Known Google Play license-test tokens; worker service-account settings required       |
| `--provider none`           | Expiration only; no provider keys                                                     |
| `--dry-run`                 | Read and report differences without database or queue writes                          |

Expiration is included with every provider selection. It recalculates due
entitlement snapshots from stored verified boundaries without changing provider
records. API access already checks time independently of the scheduler.

All commands use the fixed Compose table and subscription queue. The worker
needs its local database/queue `.env` settings. Stripe work loads
`STRIPE_SECRET_KEY` (test mode) and `STRIPE_PRICE_ID` from the worker environment.
Apple work loads the worker's enabled Sandbox settings and In-App Purchase key
only when a known Apple subscription exists. See [Apple reconciliation](APPLE_PURCHASES.md#local-reconciliation).
Mock and expiration jobs need neither provider's credentials.
For partial failures, exit codes, retries, and the cloud boundary, see
[Reconciliation](RECONCILIATION.md#follow-a-run).

### Exercise a missed Google mock event (T20)

Use an existing synthetic user and a unique `mock_google_` subscription ID:

```sh
pnpm subscription:google-mock <internal-user-id> mock_google_demo active
# Wait for subscription.processed in the worker terminal.
pnpm subscription:google-mock <internal-user-id> mock_google_demo revoked --suppress-event
pnpm subscription:reconcile --user <internal-user-id> --provider google_mock --dry-run
pnpm subscription:reconcile --user <internal-user-id> --provider google_mock
```

The suppressed change updates only the independent mock source. Derived access
stays unchanged until reconciliation/worker processing repairs it. Repeat the
last command: fresh verification may update metadata, but it must not create a
second domain-change outbox event. Another valid provider still grants Premium.

Other scenarios: `renewal_failed` retains the previous period with bounded grace;
`canceling` disables renewal while preserving its boundary; `expired`, `revoked`,
and `pending` grant nothing. `active --until <future-UTC-timestamp>` sets an explicit
boundary. Failure/cancellation require an existing period; repeated failure never
restarts grace. These are synthetic local states, not Google Play purchases.
Old `subscription:seed` records are separate and are not authoritative mock state.

For T21, a Stripe customer mapping must preexist. Reconciliation lists all that
customer's test subscriptions, including ones absent locally after a missed
initial webhook. The worker verifies ownership and paid periods before granting
access. Provider errors never mean deletion. [Technical behavior](RECONCILIATION.md#recovery-guarantees).

## Cleanup

Choose the intended result. Local data, provider subscriptions, and AWS resources
have separate lifecycles; deleting one does not delete the others.

### Pause work

1. Stop `pnpm dev`, Metro, the Stripe listener, and ngrok with `Ctrl+C` in their
   terminals. Stop any individually launched services too.
2. Leave Docker running to keep in-memory queue messages, or run:

   ```sh
   pnpm local:down
   ```

   This removes this Compose project's containers/network. DynamoDB records
   remain in the named volume; ElasticMQ messages are lost when its container
   stops. Resume with `pnpm dev` and restart the needed listener/tunnel.

3. For a longer Apple pause, [remove the sandbox notification URL](APPLE_PURCHASES.md#cleanup)
   so Apple no longer targets an inactive tunnel.

### Reset local data

**Deletes all profiles, customer/owner mappings, subscriptions, markers, and
outbox records and independent Google mock state in this project's local database,
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
   through the [Stripe](PAYMENTS.md#cleanup) or [Apple](APPLE_PURCHASES.md#cleanup)
   management flow if that is your intent.
2. Remove project webhook destinations and stop forwarding/tunnels.
3. Follow [AWS cleanup](../infra/README.md#cleanup) if you deployed resources.
4. Remove dedicated [Auth0 resources](AUTH0_SETUP.md#cleanup), revoke only
   project-specific keys, and remove their ignored local files when no longer
   needed. Preserve shared tenants, connections, keys, and developer accounts.
5. Sign out of the demo clients. Clear only this site's browser data if desired;
   uninstall the development app if you no longer need it.

No command here removes all external resources automatically. Verify the target
account/environment and each resource before deleting it.
