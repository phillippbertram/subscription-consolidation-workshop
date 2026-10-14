# Development

Complete [Getting started](GETTING_STARTED.md) once. This guide covers everyday
work, local diagnostics, and cleanup. Commands run from the repository root.

## Run and check

| Command                                       | Purpose                                                                                        |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `pnpm dev`                                    | Initialize Docker/table, then run API, both webhooks, worker, and Web                          |
| `pnpm local:up` / `pnpm local:down`           | Start/initialize or remove Compose containers; retain database volume                          |
| `pnpm dev:api` / `pnpm dev:api:lan`           | API on loopback / all IPv4 interfaces                                                          |
| `pnpm dev:webhook` / `pnpm dev:apple-webhook` | Individual Stripe / Apple ingress                                                              |
| `pnpm dev:worker` / `pnpm web:dev`            | Individual worker / website                                                                    |
| `pnpm stripe:listen`                          | Forward Stripe test events; separate CLI terminal                                              |
| `pnpm mobile:ios` / `pnpm mobile:dev`         | Build native iOS app / run Metro for an installed app                                          |
| `pnpm mobile:dev:lan`                         | Metro for a physical iPhone; [device setup](../apps/mobile/README.md#run-on-a-physical-iphone) |
| `pnpm format` / `pnpm check`                  | Apply code formatting; verify formatting, lint, types, and builds                              |
| `pnpm synth`                                  | Produce CDK assembly locally; no deployment                                                    |

Use the grouped stack or individual commands, not both. Restart after `.env`
changes. `pnpm build` bundles backend entry points, builds Web, and exports
Mobile JavaScript; it does not build the native iOS app. `pnpm start` runs the
built local API. There is no automated test suite.

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

## Local subscription CLI

Copy the internal user UUID from Web account details or Mobile developer tools.
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

All CLI writes target the fixed Compose database. Reconciliation needs the
worker's test key/price and an existing Stripe customer mapping, but no running
worker or queue. It discovers missing subscriptions, verifies ownership, and
reports partial failures with a nonzero exit code. It never changes Stripe.
`list`, `set`, and mock seeding need no provider credentials.

For independent mock records, use `pnpm demo:subscription <internal-user-id>
<scenario>` with `active`, `expiring`, `multiple`, or `free`. These scenarios
change only two reserved, marked demo records. `free` removes those records;
it does not remove real provider grants. Refresh the client after changes.

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
outbox records in this project's local database, plus queued work.** It does
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
