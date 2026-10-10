# PremiumPass

A hands-on learning project: a React Native app with Auth0 and an AWS backend that translates Stripe test subscriptions and Apple/Google mocks into central entitlements. All data is synthetic. Code and documentation use English.

## Navigation

| File | Purpose |
|---|---|
| [AGENTS.md](AGENTS.md) | Working rules for coding agents |
| [Project plan](PROJECT_PLAN.md) | Scope, architecture, weekend schedule, and manual verification scenarios |
| [Decisions](docs/DECISIONS.md) | Agreed direction, open questions, and implementation proposals |
| [Tasks](docs/TASKS.md) | Small work packages with dependencies, status, and acceptance criteria |
| [Auth0 setup](docs/AUTH0_SETUP.md) | Existing tenant setup: API, permissions, clients, users, and local configuration |

The project directory is the source of truth. Earlier Library files are historical exports.

## Current implementation

The pnpm workspace contains the Hono skeleton in `services/bff`. `GET /health` is public and returns `{"status":"ok"}`. It checks only whether the application responds, not whether external services are ready. `GET /v1/me` requires an Auth0 access token with `read:me` and returns only verified identity claims. All routes registered after the public health route require authentication; an authenticated request to an unknown route returns 404. Progress is tracked in the [task plan](docs/TASKS.md).

```text
services/bff/
  src/
    app.ts          Shared app factory; does not open a port
    auth.ts         JWT verification, cached JWKS, and scope middleware
    config.ts       Auth0 and local startup configuration validation
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

Copy the example only during initial setup; preserve an existing `.env` and add the Auth0 fields shown below. Replace the placeholder issuer and audience to use real Auth0 tokens. `pnpm dev` starts the server with file watching through `tsx watch`. In a second terminal:

```sh
curl --fail http://127.0.0.1:3000/health
```

Expected response: `{"status":"ok"}`. Stop with `Ctrl+C`.

The local server requires `PORT`, an integer from 0 to 65535. The example uses 3000; 0 lets the operating system choose a free port, which appears in the startup log. `pnpm dev` and `pnpm start` read `services/bff/.env`; existing environment variables take precedence. To run without a file, supply `PORT`, `AUTH0_ISSUER`, and `AUTH0_AUDIENCE` as environment variables. Missing or invalid values produce an explanatory error before the server starts. A port already in use produces a server error; in watch mode, the watcher then waits for a change or `Ctrl+C`.

Startup requires public Auth0 configuration, but no Auth0 client secret or AWS credentials. The placeholder configuration can start the server and serve `/health`; it cannot validate real tokens. Local `.env` files are ignored; `.env.example` is versioned. Do not put tokens or secrets in documentation or logs.

## Backend authentication

Follow the [Auth0 setup guide](docs/AUTH0_SETUP.md) to configure an existing tenant, obtain the required values, and prepare the later mobile and web clients.

Both entry points validate these settings once at startup:

| Variable | Meaning |
|---|---|
| `AUTH0_ISSUER` | Exact tenant or custom-domain issuer, for example `https://your-tenant.eu.auth0.com/`; HTTPS origin with a trailing slash, no additional path/query/credentials |
| `AUTH0_AUDIENCE` | Auth0 Custom API identifier, for example `https://api.premiumpass.example`; never the Native/SPA client ID |
| `PORT` | Local server only; not required by Lambda |

Missing or malformed configuration stops startup. Node still loads `.env`; `readAuthConfig` and `readLocalConfig` validate its values. Lambda receives the same Auth0 settings through environment variables in P03.

The middleware uses `jose` to verify RS256 signatures, exact issuer, API audience, required expiration, optional `nbf`, and a non-empty subject, with five seconds of clock tolerance. Tokens need a non-empty `kid`. ID tokens issued for an application client do not match the Custom API audience. Scope checks use the verified `scope` claim. Do not replace the API audience with a client ID.

Signing keys come only from `<AUTH0_ISSUER>.well-known/jwks.json`; token-supplied URLs are ignored. Each app instance reuses its JWKS resolver (including warm Lambda invocations): ten-minute cache lifetime, five-second retrieval timeout, and 30 seconds between refresh attempts, including failures. A newly rotated key may be rejected until the refresh cooldown expires. Still-valid cached keys remain usable during a provider outage; expired keys are not used as a fallback. No local authentication bypass or mock verifier exists in the runtime.

`GET /v1/me` returns the verified identity, for example:

```json
{
  "issuer": "https://your-tenant.eu.auth0.com/",
  "subject": "auth0|example-user",
  "scopes": ["read:me"]
}
```

This is not yet a persisted user profile or an internal user ID. Identity mapping and DynamoDB follow in P03. Client-supplied user IDs do not determine the identity. Scopes do not grant Premium access; entitlement checks follow later.

| Result | Meaning |
|---|---|
| `200` | Valid access token with `read:me` |
| `401` / `unauthorized` | Missing, malformed, expired, unverifiable, or otherwise invalid token |
| `403` / `insufficient_scope` | Valid token without `read:me` |
| `503` / `authentication_unavailable` | Signing keys cannot be retrieved and no usable cached key can verify the token; retry after 30 seconds |

Error bodies contain `error.code` and `error.requestId`; responses also include `X-Request-Id` and `Cache-Control: no-store`. Tokens and raw authentication errors are never logged or returned. `/health` remains public and does not fetch JWKS. Register new user routes below `authenticate` and declare their scopes with `requireScopes`.

For a manual check, start the server and call:

```sh
curl -i http://127.0.0.1:3000/health
curl -i http://127.0.0.1:3000/v1/me
```

Expect 200 and 401 respectively. With an access token obtained for the configured Custom API, set `ACCESS_TOKEN` in your local shell without saving it in project files or documentation, then call:

```sh
curl -i -H "Authorization: Bearer $ACCESS_TOKEN" http://127.0.0.1:3000/v1/me
```

Expect 200 with `read:me`, or 403 without it. P02 was also checked manually using generated RSA keys and a temporary local HTTPS JWKS server; no automated tests or fixture scripts are part of the repository. Results and live limitations are recorded in [P02](docs/TASKS.md#p02-backend-auth0-token-verification).

Implementation references: [jose remote JWKS](https://github.com/panva/jose/blob/main/docs/jwks/remote/functions/createRemoteJWKSet.md), [Auth0 access token validation](https://auth0.com/docs/secure/tokens/access-tokens/validate-access-tokens).

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

- Real Auth0 requests: tenant/custom-domain issuer, Custom API audience, and an access token with the required scopes. P02 local verification used generated keys and controlled JWKS instead of tenant credentials.
- P03 live work: AWS development account/profile and region.
- P04 live work: Auth0 tenant, Native Application, and Custom API with an audience.
- A remote repository, CI, and deployment have not been configured yet.

## Assigning a task to an agent

Example request for the next implementation task:

> Read AGENTS.md, docs/DECISIONS.md, and P03 in docs/TASKS.md. Work on the local portion of P03: CDK infrastructure and user persistence. Keep Auth0 verification in the backend; do not add automated tests. Check the result locally and update the task status and README commands. Do not deploy cloud resources.

Assign subsequent tasks by ID in the same way. Each task defines its outcome and boundaries. Missing live credentials do not prevent completing local implementation and manual checks.

## Basis for the agent instructions

The concise root `AGENTS.md` follows the [official project instruction guide](https://learn.chatgpt.com/docs/agent-configuration/agents-md). Project facts live in linked documents so agents do not need to treat the entire project plan as a rulebook for every task.
