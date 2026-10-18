# Development

Complete [Getting started](GETTING_STARTED.md) once. This guide covers everyday
work, local diagnostics, and cleanup. Commands run from the repository root.

## Run and check

Run `pnpm run` to list all root scripts. Names follow these groups:
`dev:*` for long-running development processes, `local:*` for Docker,
`mobile:*` for native builds, `cli` for all local subscription tools,
and `infra:*` for CDK. Standard checks keep their short names.
Additional arguments follow the command directly, for example
`pnpm cli reconcile --provider google --dry-run`.

### Development processes

| Command                                              | Starts                                                                                            |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `pnpm dev`                                           | Docker + table, then API, Stripe/Apple webhooks, worker, Web, reconciliation watcher              |
| `pnpm dev:api` / `pnpm dev:api:lan`                  | API on loopback / on all interfaces (for a phone on the LAN)                                      |
| `pnpm dev:web`                                       | Website only                                                                                      |
| `pnpm dev:mobile` / `pnpm dev:mobile:lan`            | Metro for the development app ([device setup](../apps/mobile/README.md#run-on-a-physical-iphone)) |
| `pnpm dev:webhook:stripe` / `pnpm dev:webhook:apple` | One webhook process                                                                               |
| `pnpm dev:webhook:google`                            | Google Pub/Sub webhook on port 3004                                                               |
| `pnpm dev:worker`                                    | Subscription queue worker                                                                         |
| `pnpm dev:outbox` / `pnpm dev:events`                | Outbox publisher (repeating) / its log consumer                                                   |
| `pnpm cli reconcile --watch`                         | Reconciliation watcher, only when not using `pnpm dev`                                            |

- Use either `pnpm dev` or individual processes, not both.
- Google webhook, Metro, outbox publisher, and log consumer always start separately.
- Restart processes after changing a `.env` file.

### Local tools

| Command                                       | Purpose                                                               |
| --------------------------------------------- | --------------------------------------------------------------------- |
| `pnpm local:up` / `pnpm local:down`           | Start/initialize or remove Compose containers; retain database volume |
| `pnpm local:logs`                             | Show the last 100 lines of Docker logs                                |
| `pnpm cli --help`                             | Inspect or change local subscriptions for one user                    |
| `pnpm cli seed <internal-user-id> <scenario>` | Seed reserved synthetic demo records                                  |
| `pnpm cli google-mock --help`                 | Change independent local Google mock state                            |
| `pnpm cli reconcile --dry-run`                | Preview queued reconciliation; omit `--dry-run` to enqueue            |
| `pnpm outbox:publish --dry-run`               | Preview pending outbox events; omit `--dry-run` to publish one pass   |
| `pnpm stripe:listen`                          | Forward Stripe test events in a separate CLI terminal                 |

### Builds and checks

| Command                                              | Purpose                                                                                 |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `pnpm format` / `pnpm check`                         | Fix lint and formatting / verify formatting, lint, types, and builds                    |
| `pnpm format:check` / `pnpm lint` / `pnpm typecheck` | One check on its own                                                                    |
| `pnpm lint:fix`                                      | ESLint fixes only                                                                       |
| `pnpm build` / `pnpm start:api`                      | Build all workspaces / start the built local API                                        |
| `pnpm mobile:ios` / `pnpm mobile:android`            | Build and install the native development app                                            |
| `pnpm mobile:android:doctor`                         | Check Java and Android SDK prerequisites                                                |
| `pnpm mobile:android:aab` (`--unsigned`)             | Signed Play upload / unsigned test bundle ([setup](GOOGLE_PLAY.md#local-android-build)) |
| `pnpm infra:synth`                                   | Produce the CDK template locally, without AWS calls                                     |
| `pnpm infra:bootstrap:dev` / `pnpm infra:deploy:dev` | Prepare / deploy AWS development resources ([AWS guide](../infra/README.md#deploy))     |

- `pnpm build` bundles backends, builds Web, and exports Mobile JavaScript; it
  does not compile native apps. There is no automated test suite.
- Format scripts skip Markdown. For a changed Markdown file, run
  `pnpm exec prettier --write path/to/file.md` and check its links and diagrams.

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
  commands read shell variables, then `apps/cli/.env`
  ([example](../apps/cli/.env.example)); the worker's `.env` is not loaded.
- **`stripe-sync`** needs a Stripe test key/price and an existing customer
  mapping, but no worker. It never changes Stripe; partial failures exit nonzero.
- **`seed <user-id> <scenario>`** changes only two reserved demo records
  (scenarios such as `active`, `expiring`, `multiple`, `grace`; `free` removes
  them). Real provider grants stay untouched. [Exercise 3](exercises/03-consolidation.md)
  walks through the scenarios.

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
  Step by step: [Exercise 6](exercises/06-complimentary-premium.md).

## Local reconciliation and expiration

What reconciliation does and why: [Reconciliation](RECONCILIATION.md). This
section lists the commands.

| Command                          | Effect                                                        |
| -------------------------------- | ------------------------------------------------------------- |
| `pnpm cli reconcile --dry-run`   | Preview differences for all users; no writes, no queued jobs  |
| `pnpm cli reconcile`             | Queue refresh and due expiration jobs for the worker          |
| `pnpm cli reconcile --watch`     | Run now, then every five minutes (already part of `pnpm dev`) |
| `pnpm cli stripe-sync <user-id>` | Repair Stripe directly, without the queue                     |

| Option                      | Effect                                                                        |
| --------------------------- | ----------------------------------------------------------------------------- |
| `--user <internal-user-id>` | Only this user                                                                |
| `--provider all`            | Default: Stripe test, known Apple/Google test subscriptions, and Google mocks |
| `--provider stripe`         | Stripe test only                                                              |
| `--provider apple`          | Known Apple Sandbox subscriptions only                                        |
| `--provider google`         | Known Google Play license-test tokens; needs Google settings                  |
| `--provider google_mock`    | Google mock state only; no provider keys                                      |
| `--provider none`           | Expiration only; no provider keys                                             |

- Queued jobs need a running worker (`pnpm dev` or `pnpm dev:worker`).
- Every run also checks expiration. The API enforces expiry on its own; the job
  only refreshes the stored snapshot and announces the change.
- Provider credentials load only when a matching subscription exists. Stripe
  needs `STRIPE_SECRET_KEY` (test) and `STRIPE_PRICE_ID`; Apple needs the
  [Apple settings](APPLE_PURCHASES.md#local-reconciliation).
- Logs and exit codes: [Follow a run](RECONCILIATION.md#follow-a-run).

### Exercise a missed Google mock event (T20)

```sh
pnpm cli google-mock <internal-user-id> mock_google_demo active
# Wait for subscription.processed in the worker terminal.
pnpm cli google-mock <internal-user-id> mock_google_demo revoked --suppress-event
pnpm cli reconcile --user <internal-user-id> --provider google_mock --dry-run
pnpm cli reconcile --user <internal-user-id> --provider google_mock
```

The suppressed change updates only the mock "provider". Access stays stale until
reconciliation repairs it; repeating the last command adds no second outbox
event. Guided version with explanations: [Exercise 5](exercises/05-repair-missed-updates.md).

| Google mock scenario            | Effect                                                  |
| ------------------------------- | ------------------------------------------------------- |
| `active [--until]`              | Access until one hour from now, or an explicit UTC time |
| `renewal_failed`                | Keeps the previous period plus bounded grace            |
| `canceling`                     | Renewal off; access until the existing boundary         |
| `expired`, `revoked`, `pending` | No access                                               |

These are synthetic local states, not Google Play purchases. Failure and
cancellation need an existing period; repeated failure never restarts grace.

**T21 (missed initial Stripe webhook):** the Stripe customer mapping must
already exist. Reconciliation lists all of that customer's test subscriptions,
including ones never stored locally, and the worker verifies them before
granting access. [Recovery guarantees](RECONCILIATION.md#recovery-guarantees).

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
