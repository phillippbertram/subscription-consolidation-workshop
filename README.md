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
| [Infrastructure](infra/README.md) | Local CDK synthesis, DynamoDB setup, and future deployment commands |
| [DynamoDB data model](docs/DYNAMODB_DATA_MODEL.md) | Implemented identity, profile, and subscription records, fields, examples, and access patterns |
| [Subscriptions](docs/SUBSCRIPTIONS.md) | Access policy, endpoints, and local Free/Premium scenarios |
| [Stripe flow diagrams](docs/STRIPE_FLOW.md) | Checkout sequence, DynamoDB relationships, retries, and planned subscription processing |
| [Stripe setup](docs/STRIPE_SETUP.md) | Local test configuration, customer ownership, checkout, and recovery |
| [Web app](apps/web/README.md) | React, Tailwind, shadcn/ui, and Auth0 SPA startup |
| [Mobile app](apps/mobile/README.md) | Expo development build, Auth0 login, and iOS Simulator against the local BFF |

The project directory is the source of truth. Earlier Library files are historical exports.

## Current implementation

The pnpm workspace contains the Hono BFF in `services/bff`. `GET /health` is public and returns `{"status":"ok"}`. It checks only whether the application responds, not whether external services are ready. `GET /v1/me` requires an Auth0 user access token with `read:me` and returns its persisted internal user ID and creation time. All routes registered after the public health route require authentication; an authenticated request to an unknown route returns 404. Progress is tracked in the [task plan](docs/TASKS.md).

```text
services/bff/
  src/
    app.ts          Shared app factory; does not open a port
    auth.ts         JWT verification, cached JWKS, and scope middleware
    config.ts       Auth0 and local startup configuration validation
    logging.ts      Structured HTTP logs and bounded debug body previews
    users.ts        Framework-independent identity, profile, and store contract
    dynamodb-users.ts Atomic identity mapping and profile persistence
    domain/         Pure subscription mappings and access policy
    subscriptions.ts Framework-independent subscription store contract
    dynamodb-subscriptions.ts Validated, paginated subscription reads
    persistence.ts  AWS SDK client composition
    local.ts        Node HTTP server on 127.0.0.1
    lambda.ts       Lambda handler for API Gateway HTTP API
  .env.example      Versioned local configuration example
```

`infra` contains the CDK app for the HTTP API, BFF, DynamoDB, and logs; see the [infrastructure guide](infra/README.md). Additional apps, workers, and shared packages are added only when needed. The target structure is in the [project plan](PROJECT_PLAN.md#14-repository-and-cicd). pnpm scripts coordinate the workspace.

The HTTP API uses a `$default` integration to forward requests to the BFF. Define BFF routes once in Hono; no per-endpoint CDK registration is needed. Unknown paths reach the same authentication middleware and return 401 without a valid token or 404 with one. Future explicit integrations, such as the Stripe webhook, can override the catch-all for their own route.

## Installation and local startup

For the Expo app, follow the [mobile setup guide](apps/mobile/README.md). The commands below start the backend and its local database.

Run all commands below from the repository root. The project pins **Node.js 24.19.0** (`.nvmrc`, `engines`) and **pnpm 12.10.1** (`packageManager`, `engines`). If nvm is installed, run `nvm install` followed by `nvm use` to activate the Node version. If pnpm is missing, run `npm install --global pnpm@12.10.1` once under that Node version.

```sh
pnpm install --frozen-lockfile
cp services/bff/.env.example services/bff/.env
pnpm db:up
pnpm dev
```

Copy the example only during initial setup; preserve an existing `.env` and add the Auth0 and DynamoDB fields shown below. Start Docker Desktop before `pnpm db:up`; that command starts DynamoDB Local and its browser GUI, then automatically creates the table. Open [DynamoDB Admin](http://127.0.0.1:8001) and select `premiumpass-local` to inspect the records. Data survives `pnpm db:down` and subsequent starts. See the [local database instructions](infra/README.md#local-dynamodb-and-manual-requests). Replace the placeholder issuer and audience to use real Auth0 tokens. `pnpm dev` starts the server with file watching through `tsx watch`. In a second terminal:

```sh
curl --fail http://127.0.0.1:3000/health
```

Expected response: `{"status":"ok"}`. Stop with `Ctrl+C`.

The local server requires `PORT`, an integer from 0 to 65535. The example uses 3000; 0 lets the operating system choose a free port, which appears in the startup log. `pnpm dev` and `pnpm start` read `services/bff/.env`; existing environment variables take precedence. To run without a file, supply `PORT`, `AUTH0_ISSUER`, `AUTH0_AUDIENCE`, `DYNAMODB_TABLE_NAME`, and the local `DYNAMODB_ENDPOINT` as environment variables. Missing or invalid values produce an explanatory error before the server starts. A port already in use produces a server error; in watch mode, the watcher then waits for a change or `Ctrl+C`.

Startup requires public Auth0 and table configuration, but no Auth0 client secret. With a local DynamoDB endpoint, the SDK uses dummy credentials; AWS operation uses its normal credential chain. The placeholder configuration can start the server and serve `/health`; it cannot validate real tokens. Local `.env` files are ignored; `.env.example` is versioned. Do not put tokens or secrets in documentation or logs.

## Local checkout website

Follow [Stripe setup](docs/STRIPE_SETUP.md) to configure your own test key, monthly price, and Auth0 SPA. Run `pnpm web:dev` alongside the BFF and DynamoDB, then open http://localhost:5173. The React app uses Tailwind v4 and shadcn/ui. Checkout creates a customer and session; activation requires P06 step 2.

## Backend authentication

Follow the [Auth0 setup guide](docs/AUTH0_SETUP.md) to configure an existing tenant, obtain the required values, and prepare the later mobile and web clients.

Both entry points validate these settings once at startup:

| Variable | Meaning |
|---|---|
| `AUTH0_ISSUER` | Exact tenant or custom-domain issuer, for example `https://your-tenant.eu.auth0.com/`; HTTPS origin with a trailing slash, no additional path/query/credentials |
| `AUTH0_AUDIENCE` | Auth0 Custom API identifier, for example `https://api.premiumpass.example`; never the Native/SPA client ID |
| `PORT` | Local server only; not required by Lambda |
| `DYNAMODB_TABLE_NAME` | Required table name; `premiumpass-local` in the local example |
| `DYNAMODB_ENDPOINT` | Optional loopback HTTP origin, e.g. `http://127.0.0.1:8000`; local entry only, rejected by Lambda |

Missing or malformed configuration stops startup. Node still loads `.env`; `readAuthConfig` and `readLocalConfig` validate its values. The CDK stack supplies Lambda configuration through environment variables and public CloudFormation parameters.

The middleware uses `jose` to verify RS256 signatures, exact issuer, API audience, required expiration, optional `nbf`, and a non-empty subject, with five seconds of clock tolerance. Tokens need a non-empty `kid`. ID tokens issued for an application client do not match the Custom API audience. Scope checks use the verified `scope` claim. Do not replace the API audience with a client ID.

Signing keys come only from `<AUTH0_ISSUER>.well-known/jwks.json`; token-supplied URLs are ignored. Each app instance reuses its JWKS resolver (including warm Lambda invocations): ten-minute cache lifetime, five-second retrieval timeout, and 30 seconds between refresh attempts, including failures. A newly rotated key may be rejected until the refresh cooldown expires. Still-valid cached keys remain usable during a provider outage; expired keys are not used as a fallback. No local authentication bypass or mock verifier exists in the runtime.

`GET /v1/me` returns a minimal persisted profile, for example:

```json
{
  "userId": "389f7e6b-2f11-423c-ba09-110e64cc1e7f",
  "createdAt": "2026-10-10T12:00:00.000Z"
}
```

The store hashes the JSON-serialized verified `[issuer, subject]` pair and atomically creates an identity mapping plus a UUID-based profile. Conditional writes and consistent reads make concurrent first requests converge on one profile; conflicts receive bounded retries with jitter. Client-supplied user IDs do not determine the identity. No email, display name, or token is persisted. Machine identities (`gty: client-credentials` or an Auth0 `@clients` subject) cannot create user profiles. Scopes do not grant Premium access; entitlement checks follow later.

| Result | Meaning |
|---|---|
| `200` | Valid user access token with `read:me`; profile retrieved or created |
| `401` / `unauthorized` | Missing, malformed, expired, unverifiable, or otherwise invalid token |
| `403` / `insufficient_scope` | Valid token without `read:me` |
| `403` / `user_identity_required` | Machine token cannot access a user profile |
| `500` / `internal_error` | Persistence failure or another internal error; no fabricated profile |
| `503` / `authentication_unavailable` | Signing keys cannot be retrieved and no usable cached key can verify the token; retry after 30 seconds |

Error bodies contain `error.code` and `error.requestId`; responses also include `X-Request-Id` and `Cache-Control: no-store`. Tokens and raw authentication errors are never logged or returned. `/health` remains public and does not fetch JWKS. Register new user routes below `authenticate` and declare their scopes with `requireScopes`.

For a manual check, start the server and call:

```sh
curl -i http://127.0.0.1:3000/health
curl -i http://127.0.0.1:3000/v1/me
```

Expect 200 and 401 respectively. You can [obtain a user access token with the Auth0 CLI](docs/AUTH0_SETUP.md#get-a-user-token-now-with-the-auth0-cli) before the mobile app exists. With that token for the configured Custom API, set `ACCESS_TOKEN` in your local shell without saving it in project files or documentation, then call:

```sh
curl -i -H "Authorization: Bearer $ACCESS_TOKEN" http://127.0.0.1:3000/v1/me
```

With DynamoDB running and its table created, expect 200 with `read:me`, or 403 without it. Repeat with the same user to confirm a stable profile; another user must receive a different ID. P02 was also checked manually using generated RSA keys and a temporary local HTTPS JWKS server; no automated tests or fixture scripts are part of the repository. Results and live limitations are recorded in [P02](docs/TASKS.md#p02-backend-auth0-token-verification).

Implementation references: [jose remote JWKS](https://github.com/panva/jose/blob/main/docs/jwks/remote/functions/createRemoteJWKSet.md), [Auth0 access token validation](https://auth0.com/docs/secure/tokens/access-tokens/validate-access-tokens).

## Debugging BFF requests

`pnpm dev` uses Pino for structured JSON logs to stdout. A child logger binds request metadata; timestamps use the ISO `time` field. The synchronous destination also works in the Lambda bundle without a background transport. See the [Pino API](https://github.com/pinojs/pino/blob/main/docs/api.md). Each request produces an `http.request` event when it arrives and an `http.response` event after the handler finishes. Both contain a timestamp, level, service name, method, path, and `requestId`. The response event adds HTTP status and `durationMs`; 4xx responses use `warn`, and 5xx responses use `error`. The duration measures handler processing before response-preview logging, not transfer time to the client.

The same ID is returned in `X-Request-Id` and error bodies. Match it with `serverRequestId` in the mobile API logger to follow a call across the app and BFF.

Local startup defaults to `LOG_LEVEL=debug`. The response log then also includes query parameters, request/response body previews, and the name, message, and stack of unexpected server errors. Synthetic JSON and plain-text bodies are not redacted. Previews use clones, keep the original body available to handlers, and are limited to 8 KiB and a 100 ms read window per preview. Unsupported, oversized, unavailable, or slow bodies get an omission marker. Headers, cookies, Auth0 tokens, and SDK error objects are not logged automatically; never put secrets in demo URLs or bodies.

Billing routes always log metadata only, including at debug level; checkout URLs and payment payloads are excluded.

Override the level in `services/bff/.env` or for one run:

```sh
LOG_LEVEL=info pnpm dev
```

Supported levels are `debug`, `info`, `warn`, `error`, and `silent`. `info` omits bodies, query parameters, and exception details. `warn` shows only 4xx/5xx completion events; `error` shows only 5xx completion events. `silent` disables HTTP logs. These settings do not suppress the local server's startup/shutdown diagnostics. Invalid levels fail startup. Restart after changing the environment.

Lambda defaults to `info` and uses the same middleware; its console output goes to the function's CloudWatch logs when deployed. This change does not deploy anything or modify the stack's environment configuration.

For a quick local check, call `curl -i http://127.0.0.1:3000/health`, then `curl -i http://127.0.0.1:3000/v1/me`. Expect status 200 and 401 respectively, with matching request IDs in the terminal and response headers. Reload the profile in the signed-in app to see an authenticated response body at debug level.

## Checks and build

```sh
pnpm check
```

This command runs formatting checks, linting, typechecking, and the build. Individual commands:

| Command | Effect |
|---|---|
| `pnpm format:check` | Run Prettier checks for TS/TSX, JS, JSON, and YAML across the repository |
| `pnpm format` | Format the same files, excluding generated files and the lockfile |
| `pnpm lint` | Run ESLint, including type-aware TypeScript rules |
| `pnpm typecheck` | Typecheck all workspace packages |
| `pnpm build` | Bundle local and Lambda entry points with esbuild |
| `pnpm start` | Start the built local server without watch mode |
| `pnpm web:dev` | Start the React checkout website on localhost:5173 |
| `pnpm mobile:ios` | Build/install the native Expo app and start Metro for the iOS Simulator |
| `pnpm mobile:dev` | Start Metro for the already installed mobile development app |
| `pnpm db:up` | Start DynamoDB Local through Compose and automatically initialize its table |
| `pnpm db:down` | Stop/remove local database containers while preserving data |
| `pnpm db:logs` | Show the latest local database logs |
| `pnpm synth` | Synthesize the CDK stack locally, including its Lambda asset; no deployment |
| `pnpm deploy:dev --dry-run` | Validate `infra/.env` and preview deployment commands without AWS requests |
| `pnpm bootstrap:dev` | Check the configured AWS account, then bootstrap its selected region |
| `pnpm deploy:dev` | Check the configured AWS account, then deploy `PremiumPassDev` |

For deployment configuration and the one-time bootstrap step, see the [infrastructure guide](infra/README.md#development-deployment-scripts). Deployment scripts read `infra/.env`; they do not load the BFF configuration file.

Check Markdown links and consistency when changing documentation. `git diff --check` also checks tracked changes for whitespace issues; inspect new files separately.

The build produces `services/bff/dist/local.js` and `services/bff/dist/lambda.js` as ESM bundles for Node 24. Run `pnpm start` after `pnpm build` to launch the built local server. The standalone Lambda export is `handler` (`lambda.handler` in an ESM package). CDK separately bundles the same source as `index.mjs` with deployment handler `index.handler`, including the pinned AWS SDK. `pnpm build` also typechecks infrastructure and exports the mobile iOS JavaScript bundle to `apps/mobile/dist`; it does not build the native iOS app. `pnpm synth` produces the deployable AWS assembly.

At the user's request, this learning project has no automated tests or test framework. Verify behavior through manual requests; typechecking, linting, and builds remain configured. The Lambda entry point opens no HTTP port and does not require `PORT`. The local portion of P03 is implemented; live AWS verification remains outstanding by request.

## Environment needed later

- Real Auth0 requests: tenant/custom-domain issuer, Custom API audience, and an access token with the required scopes. P02 local verification used generated keys and controlled JWKS instead of tenant credentials.
- P03 live work: explicitly authorized AWS development account/profile and region; [deployment instructions](infra/README.md#development-deployment-scripts).
- P04 live work: Auth0 tenant, Native Application, and Custom API with an audience.
- A remote repository, CI, and deployment have not been configured yet.

## Assigning a task to an agent

Example request for the remaining live portion of P03, only when deployment is desired:

> Read AGENTS.md, docs/DECISIONS.md, and P03 in docs/TASKS.md. Verify the agreed development AWS account/profile and region, then deploy the existing CDK stack with the configured Auth0 issuer and audience. Check health, unauthorized access, and repeated profile requests for two real demo users. Record the live evidence; keep code and documentation in English and add no automated tests.

Assign subsequent tasks by ID in the same way. Each task defines its outcome and boundaries. Missing live credentials do not prevent completing local implementation and manual checks.

## Basis for the agent instructions

The concise root `AGENTS.md` follows the [official project instruction guide](https://learn.chatgpt.com/docs/agent-configuration/agents-md). Project facts live in linked documents so agents do not need to treat the entire project plan as a rulebook for every task.


## Subscription scenarios (P05)

The dashboard reads subscriptions and derives Free/Premium access from DynamoDB on every request. Start DynamoDB and the BFF as described above, sign in, and copy your internal user ID from the app:

```sh
pnpm demo:subscription <internal-user-id> active
pnpm demo:subscription <internal-user-id> expiring
pnpm demo:subscription <internal-user-id> free
```

Reload the dashboard after each change. `expiring` grants 30 seconds of access; no subsequent event is needed for the API to deny access. The command only targets the Compose database and two explicitly marked demo records. It makes no purchase and cannot target AWS. See [subscription rules and manual scenarios](docs/SUBSCRIPTIONS.md) and the [DynamoDB model](docs/DYNAMODB_DATA_MODEL.md#subscriptions).

The app now requests `read:premium` as well as `read:me`. Ensure the API permission, user role, and application grant allow it, then **sign out and sign in again**. A valid scope alone does not grant Premium content. See the [Auth0 permission setup](docs/AUTH0_SETUP.md#3-configure-user-permissions-and-application-access).
