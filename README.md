# PremiumPass

A hands-on learning project: a React Native app with Auth0 and an AWS backend that translates Stripe test subscriptions and Apple/Google mocks into central entitlements. All data is synthetic. Code and documentation use English.

## Navigation

| File | Purpose |
|---|---|
| [AGENTS.md](AGENTS.md) | Working rules for coding agents |
| [Project plan](PROJECT_PLAN.md) | Scope, architecture, weekend schedule, and manual verification scenarios |
| [Decisions](docs/DECISIONS.md) | Agreed direction, open questions, and implementation proposals |
| [Tasks](docs/TASKS.md) | Small work packages with dependencies, status, and acceptance criteria |

The project directory is the source of truth. Earlier Library files are historical exports.

## Current implementation

The pnpm workspace contains the Hono skeleton in `services/bff`. `GET /health` is public and returns `{"status":"ok"}`. It checks only whether the application responds, not whether external services are ready. Authentication and `GET /v1/me` follow in P02; unknown routes currently return 404. Progress is tracked in the [task plan](docs/TASKS.md).

```text
services/bff/
  src/
    app.ts          Shared app factory; does not open a port
    config.ts       Local startup configuration validation
    local.ts        Node HTTP server on 127.0.0.1
    lambda.ts       Lambda handler for API Gateway HTTP API
  .env.example      Versioned local configuration example
```

`infra` follows in P03. Additional apps, workers, and shared packages are added only when needed. The target structure is in the [project plan](PROJECT_PLAN.md#14-repository-and-cicd). pnpm scripts coordinate the workspace.

## Installation and local startup

Run all commands below from the repository root. The project pins **Node.js 24.19.0** (`.nvmrc`, `engines`) and **pnpm 12.10.1** (`packageManager`, `engines`). If nvm is installed, run `nvm install` followed by `nvm use` to activate the Node version. If pnpm is missing, run `npm install --global pnpm@12.10.1` once under that Node version.

```sh
pnpm install --frozen-lockfile
cp services/bff/.env.example services/bff/.env
pnpm dev
```

Copy the example only during initial setup; preserve an existing `.env`. `pnpm dev` starts the server with file watching through `tsx watch`. In a second terminal:

```sh
curl --fail http://127.0.0.1:3000/health
```

Expected response: `{"status":"ok"}`. Stop with `Ctrl+C`.

The local server requires `PORT`, an integer from 0 to 65535. The example uses 3000; 0 lets the operating system choose a free port, which appears in the startup log. `pnpm dev` and `pnpm start` read `services/bff/.env`; existing environment variables take precedence. To run without a file, use `PORT=3000 pnpm dev`. Missing or invalid values produce an explanatory error before the server starts. A port already in use produces a server error; in watch mode, the watcher then waits for a change or `Ctrl+C`.

P01 requires no cloud credentials. Local `.env` files are ignored; `.env.example` is versioned. Do not put tokens or secrets in documentation or logs.

## Checks and build

```sh
pnpm check
```

This command runs formatting checks, linting, typechecking, and the build. Individual commands:

| Command | Effect |
|---|---|
| `pnpm format:check` | Run Prettier checks for TS, JS, JSON, and YAML across the repository |
| `pnpm format` | Format the same files, excluding generated files and the lockfile |
| `pnpm lint` | Run ESLint, including type-aware TypeScript rules |
| `pnpm typecheck` | Typecheck all workspace packages |
| `pnpm build` | Bundle local and Lambda entry points with esbuild |
| `pnpm start` | Start the built local server without watch mode |

Check Markdown links and consistency when changing documentation. `git diff --check` also checks tracked changes for whitespace issues; inspect new files separately.

The build produces `services/bff/dist/local.js` and `services/bff/dist/lambda.js` as ESM bundles for Node 24. Run `pnpm start` after `pnpm build` to launch the built local server. The Lambda export is `handler`; the eventual deployment handler name is `lambda.handler`, and the bundle must load as ESM (for example, include a `package.json` with `"type": "module"` in the artifact). CDK bundling and deployment follow in P03.

At the user's request, this learning project has no automated tests or test framework. Verify behavior through manual requests; typechecking, linting, and builds remain configured. The Lambda entry point opens no HTTP port and does not require `PORT`. Live AWS verification follows in P03.

## Environment needed later

- P02 manual authentication checks: generated test keys and a controlled JWKS; no real credentials required.
- P03 live work: AWS development account/profile and region.
- P04 live work: Auth0 tenant, Native Application, and Custom API with an audience.
- A remote repository, CI, and deployment have not been configured yet.

## Assigning a task to an agent

Example request for the next implementation task:

> Read AGENTS.md, docs/DECISIONS.md, and P02 in docs/TASKS.md. Work only on P02. Add Auth0 token verification using local test keys and a controlled JWKS. Check the result locally and update the task status and README commands. Do not deploy cloud resources.

Assign subsequent tasks by ID in the same way. Each task defines its outcome and boundaries. Missing live credentials do not prevent completing local implementation and manual checks.

## Basis for the agent instructions

The concise root `AGENTS.md` follows the [official project instruction guide](https://learn.chatgpt.com/docs/agent-configuration/agents-md). Project facts live in linked documents so agents do not need to treat the entire project plan as a rulebook for every task.
