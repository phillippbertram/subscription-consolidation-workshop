# PremiumPass CLI

Local developer commands for inspecting subscriptions, changing demo access,
seeding scenarios, and reconciling provider state. This workspace owns commands,
interactive prompts, output, and the five-minute local reconciliation loop.

`pnpm dev` starts the reconciliation watcher automatically alongside the local
services. Use `pnpm cli reconcile --watch` only when starting services separately.

Use one entry point from the repository root:

```sh
pnpm cli                                      # interactive
pnpm cli list <internal-user-id>
pnpm cli premium grant <internal-user-id> --forever --reason "Demo access"
pnpm cli premium revoke <internal-user-id> --reason "Demo ended"
pnpm cli premium list <internal-user-id>
pnpm cli stripe-sync <internal-user-id> --dry-run
pnpm cli reconcile --dry-run
pnpm cli seed <internal-user-id> active
pnpm cli google-mock --help
pnpm cli reconcile --help
pnpm cli reconcile --watch
```

[Development](../../docs/DEVELOPMENT.md#local-subscription-cli) owns the command
reference and manual scenarios. [Reconciliation](../../docs/RECONCILIATION.md)
explains direct Stripe repair versus queued provider refreshes.

## Configuration

Only provider reconciliation loads credentials. Copy [.env.example](.env.example)
to `apps/cli/.env` and configure the providers you use. Existing shell variables
override this file. The CLI does not load another application's `.env`; existing
worker settings must also be configured explicitly for the CLI. The file is
optional when all required provider settings are supplied through the shell.
Paths resolve relative to the application, including when running built entries
from another directory. Use absolute paths for provider credential files.

Database writes always target the fixed Compose DynamoDB database, and queue
commands always target the fixed local ElasticMQ queue. Environment overrides
cannot redirect them to AWS. `list`, `set`, and seeding require no provider keys.
Direct `stripe-sync` needs no running worker or queue; queued
`reconcile` and mock notifications require the local worker to apply
access changes. `--dry-run` never writes database state or enqueues jobs.

## Code map

| Entry                            | Responsibility                                                    |
| -------------------------------- | ----------------------------------------------------------------- |
| `src/main.ts`, `src/cli/`        | Lifecycle, commands, prompts, and presentation                    |
| `src/config.ts`                  | Lazy provider settings with explicit precedence                   |
| `src/local-admin/`               | Fixed local store, demo edits/seeds, and direct Stripe repair     |
| `src/reconciliation/`            | Local discovery, preview, queue delivery, and watch loop          |
| `src/local-admin/google-mock.ts` | Independent synthetic source state and optional notifications     |
| `src/local-admin/premium.ts`     | CLI options, trusted OS attribution, and shared admin-grant calls |

The CLI imports [subscription processing](../../packages/subscription-processing/README.md)
through public package exports. It does not import worker source files. Shared
transactions preserve ownership checks, revision guards, other grants, and outbox
entries. The `premium` commands manage independent complimentary grants with
local OS attribution. Grant/revoke rules, audit validation, idempotency, and
atomic writes live in the shared package's `/admin-grants` entry. See [the command reference](../../docs/DEVELOPMENT.md#complimentary-premium)
for expiry, previews, retries, and the trusted-local-operator boundary. Existing
`set` and `seed` commands remain provider demo overrides.

## Invocation and build

The root `cli` command delegates directly to this workspace; no CLI command runs through
`@premiumpass/subscription-worker`. This is a private repository tool, so it has no
global installation or `bin` entry. The script runner supplies TypeScript support
for source commands; the built entry runs with plain Node.js.

| Context                    | Example                                         |
| -------------------------- | ----------------------------------------------- |
| Repository root, source    | `pnpm cli --help`                               |
| Explicit workspace, source | `pnpm --filter @premiumpass/cli run dev --help` |
| Inside `apps/cli`, source  | `pnpm run dev --help`                           |
| Build the CLI              | `pnpm --filter @premiumpass/cli build`          |
| Explicit workspace, built  | `pnpm --filter @premiumpass/cli start --help`   |
| Repository root, built     | `node apps/cli/dist/main.js --help`             |

Each build cleans this workspace's `dist/` and emits only `main.js`. `start`
requires a completed build. Forward arguments directly after the command.

`pnpm cli stripe-sync <user-id>` performs direct Stripe repair for one user.
`pnpm cli reconcile --user <user-id>` discovers provider work and queues it for
the worker; add `--watch` to repeat every five minutes. Both support `--dry-run`.
The interactive menu also exposes direct Stripe synchronization and queued
provider reconciliation. The old `subscription*` and `dev:reconcile` root scripts
are replaced by these subcommands.
