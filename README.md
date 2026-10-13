# PremiumPass

A hands-on learning project: a React Native app with Auth0 and an AWS backend that translates subscriptions into central entitlements. The target providers are Stripe test mode, real Apple sandbox purchases, and Google mocks. All data is synthetic. Code and documentation use English. See the [task plan](docs/TASKS.md) for implementation status and the next Apple sandbox milestone.

## Navigation

| File | Purpose |
|---|---|
| [AGENTS.md](AGENTS.md) | Working rules for coding agents |
| [Project plan](PROJECT_PLAN.md) | Scope, architecture, weekend schedule, and manual verification scenarios |
| [Architecture diagrams](docs/ARCHITECTURE.md) | Clients, AWS, external services, local development, and planned extensions |
| [Decisions](docs/DECISIONS.md) | Agreed direction, open questions, and implementation proposals |
| [Tasks](docs/TASKS.md) | Small work packages with dependencies, status, and acceptance criteria |
| [Auth0 setup](docs/AUTH0_SETUP.md) | Existing tenant setup: API, permissions, clients, users, and local configuration |
| [Infrastructure](infra/README.md) | Local CDK synthesis, DynamoDB setup, and future deployment commands |
| [DynamoDB data model](docs/DYNAMODB_DATA_MODEL.md) | Implemented identity, profile, and subscription records, fields, examples, and access patterns |
| [Apple sandbox purchases](docs/APPLE_PURCHASES.md) | Key configuration, iPhone purchase/restore, and local notifications |
| [Payments](docs/PAYMENTS.md) | Stripe setup, checkout, processing, access rules, and manual checks |
| [Web app](apps/web/README.md) | React, Tailwind, shadcn/ui, and Auth0 SPA startup |
| [Stripe webhook](services/stripe-webhook/README.md) | Signed event ingestion and queue delivery |
| [Subscription worker](services/subscription-worker/README.md) | Provider verification and transactional processing |
| [Billing contracts](packages/billing-contracts/README.md) | Shared event types and queue schema |
| [Mobile app](apps/mobile/README.md) | Expo development build, Auth0 login, and iOS Simulator against the local BFF |

The project directory is the source of truth. Earlier Library files are historical exports.

## Current implementation

The pnpm workspace has one package per executable service: `services/bff`, `services/stripe-webhook`, and `services/subscription-worker`. The local stack also includes `services/apple-webhook` for sandbox notifications; the subscription worker processes both providers. Apple credential setup and the required native rebuild are in the [Apple guide](docs/APPLE_PURCHASES.md). `GET /health` is public and returns `{"status":"ok"}`. It checks only whether the application responds, not whether external services are ready. `GET /v1/me` requires an Auth0 user access token with `read:me` and returns its persisted internal user ID and creation time. All routes registered after the public health route require authentication; an authenticated request to an unknown route returns 404. Progress is tracked in the [task plan](docs/TASKS.md).

```text
services/
  bff/                  Auth0 API, profiles, subscription reads, and checkout
    src/local.ts        Local HTTP server on port 3000
    src/lambda.ts       API Gateway $default handler
    src/billing/        Checkout orchestration and customer ownership
  stripe-webhook/       Signed Stripe ingestion and queue delivery
    src/                Hono app, local server on port 3002, and Lambda entry
    scripts/            Stripe listener
  subscription-worker/  Queue consumer and subscription processing
    src/                Local poller, SQS Lambda entry, and runtime configuration
    src/processing/     Provider reads, processor, and atomic writes
    scripts/            Local subscription scenarios
packages/
  billing-contracts/    Shared event allowlist and validated queue job
  domain/               Pure subscription rules, schemas, and store contract
  persistence/          DynamoDB configuration, client factory, subscription reads
  logging/              Shared Pino setup; HTTP previews stay in the BFF
apps/
  web/                  React checkout demo on port 5173
  mobile/               Expo app; started separately
infra/                  CDK and local queue definitions
```

`infra` contains the CDK app for the HTTP API, BFF, DynamoDB, webhook/worker Lambdas, SQS/DLQ, and logs; see the [infrastructure guide](infra/README.md). Additional apps, workers, and shared packages are added only when needed. The target structure is in the [project plan](PROJECT_PLAN.md#14-repository-and-cicd). Root scripts address individual workspace packages by name with `pnpm --filter @premiumpass/<name> run <script>`. For example, `pnpm dev:api` delegates to `pnpm --filter @premiumpass/bff run dev`. Workspace-wide typechecking and builds use `pnpm -r`.

The HTTP API uses a `$default` integration to forward requests to the BFF. Define BFF routes once in Hono; no per-endpoint CDK registration is needed. Unknown paths reach the same authentication middleware and return 401 without a valid token or 404 with one. The explicit `POST /v1/webhooks/stripe` integration overrides the catch-all and verifies Stripe signatures in its own handler.

## Installation and local startup

Run commands from the repository root. The project pins **Node.js 24.19.0** (`.nvmrc`, `engines`) and **pnpm 12.10.1** (`packageManager`, `engines`). With nvm, run `nvm install` and `nvm use`. If needed, install pnpm once under that Node version with `npm install --global pnpm@12.10.1`.

For initial setup only (preserve existing `.env` files):

```sh
pnpm install --frozen-lockfile
cp services/bff/.env.example services/bff/.env
cp services/stripe-webhook/.env.example services/stripe-webhook/.env
cp services/subscription-worker/.env.example services/subscription-worker/.env
cp apps/web/.env.example apps/web/.env
```

Configure each service independently using [payment setup](docs/PAYMENTS.md#local-startup). BFF and worker must use the same database, Stripe test environment, and price; webhook and worker must share the queue URL. Each service loads only its own `.env`. To migrate an existing `services/billing/.env`, copy queue URL/signing secret to the webhook and queue URL/database/key/price to the worker. Preserve existing values and the original file; no runtime fallback reads the old file.

Start Docker Desktop, then run:

```sh
pnpm dev
```

This first runs `local:up` (DynamoDB Local, DynamoDB Admin, ElasticMQ, and idempotent table initialization), then starts five processes with labeled logs: **api**, **webhook**, **apple**, **worker**, and **web**. BFF, webhook, and worker use `tsx watch`; Vite handles website updates. Shared package source edits are picked up by the backend watchers. Restart after changing `.env` files. Ports are 3000, 3002, 3003, and 5173; stop older individual processes before starting the group. Configuration errors remain visible in the corresponding watcher; fix them and restart. If a supervised command exits, the other commands are stopped too.

`Ctrl+C` stops the supervised processes; remaining children are forcibly stopped after 15 seconds. Docker stays running so queue messages are retained. `pnpm local:down` stops Docker separately; DynamoDB records survive in their volume, but in-memory ElasticMQ messages are lost. Open [DynamoDB Admin](http://127.0.0.1:8001) to inspect `premiumpass-local`.

Stripe CLI and Mobile are intentionally separate:

```sh
pnpm stripe:listen  # Separate terminal; requires stripe login and signing-secret setup
pnpm mobile:ios     # Separate terminal; see the mobile setup guide
```

For API-only work without webhook/worker configuration:

```sh
pnpm local:up
pnpm dev:api
```

The BFF requires `PORT`, Auth0 issuer/audience, and DynamoDB configuration. `PORT` accepts 0–65535; 0 chooses a free port. `HOST` defaults to `127.0.0.1`; `pnpm dev:api:lan` selects `0.0.0.0` for a physical iPhone on the same trusted network. For the grouped stack, use `HOST=0.0.0.0 pnpm dev`. Follow the [iPhone workflow](apps/mobile/README.md#run-on-a-physical-iphone) for the mobile API URL and Metro. `pnpm dev:api` and `pnpm start` read `services/bff/.env`; Webhook and worker read their respective service `.env` files. Existing shell variables take precedence. Missing/invalid values produce explanatory errors. A port conflict is reported by the server; a watcher then waits for a change or `Ctrl+C`.

Placeholder Auth0 settings can serve `/health` but cannot validate real tokens. Local DynamoDB uses dummy credentials; omitting its endpoint selects the AWS credential chain. The local webhook requires ElasticMQ; the local worker additionally requires DynamoDB Local. Local `.env` files are ignored; never put secrets in documentation or logs.

```sh
curl --fail http://127.0.0.1:3000/health
```

Expected response: `{"status":"ok"}`. See the [mobile setup guide](apps/mobile/README.md) for the separate Expo development build.

## Local checkout website

Follow [payment setup](docs/PAYMENTS.md#local-startup) to configure your own test key, monthly price, Auth0 SPA, and Stripe listener. `pnpm dev` includes the React/Tailwind/shadcn website at http://localhost:5173. Checkout creates a customer and session. The separately started `pnpm stripe:listen` forwards events to the included webhook and worker. Use `pnpm web:dev` only when starting the website individually.

## Backend authentication

Follow the [Auth0 setup guide](docs/AUTH0_SETUP.md) to configure an existing tenant, obtain the required values, and prepare the later mobile and web clients.

Both entry points validate these settings once at startup:

| Variable | Meaning |
|---|---|
| `AUTH0_ISSUER` | Exact tenant or custom-domain issuer, for example `https://your-tenant.eu.auth0.com/`; HTTPS origin with a trailing slash, no additional path/query/credentials |
| `AUTH0_AUDIENCE` | Auth0 Custom API identifier, for example `https://api.premiumpass.example`; never the Native/SPA client ID |
| `PORT` | Local server only; not required by Lambda |
| `HOST` | Local server only: `127.0.0.1` by default, or `0.0.0.0` for LAN access |
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

The store hashes the JSON-serialized verified `[issuer, subject]` pair and atomically creates an identity mapping plus a UUID-based profile. Conditional writes and consistent reads make concurrent first requests converge on one profile; conflicts receive bounded retries with jitter. Client-supplied user IDs do not determine the identity. No email, display name, or token is persisted. Machine identities (`gty: client-credentials` or an Auth0 `@clients` subject) cannot create user profiles. Scopes alone do not grant Premium access; the backend also evaluates subscription entitlements.

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

The BFF uses Pino for structured JSON logs to stdout. Grouped `pnpm dev` adds process labels; `pnpm dev:api` retains the raw JSON output. A child logger binds request metadata; timestamps use the ISO `time` field. The synchronous destination also works in the Lambda bundle without a background transport. See the [Pino API](https://github.com/pinojs/pino/blob/main/docs/api.md). Each request produces an `http.request` event when it arrives and an `http.response` event after the handler finishes. Both contain a timestamp, level, service name, method, path, and `requestId`. The response event adds HTTP status and `durationMs`; 4xx responses use `warn`, and 5xx responses use `error`. The duration measures handler processing before response-preview logging, not transfer time to the client.

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
| `pnpm dev` | Start Docker/table initialization, then API, webhook, worker, and website with labeled logs |
| `pnpm dev:api` | Start only the BFF with file watching |
| `pnpm dev:api:lan` | Start the BFF on all IPv4 interfaces for local iPhone development |
| `pnpm start` | Start the built local server without watch mode |
| `pnpm web:dev` | Start the React checkout website on localhost:5173 |
| `pnpm mobile:ios` | Build/install the native Expo app and start Metro for the iOS Simulator |
| `pnpm mobile:dev` | Start Metro for the already installed mobile development app |
| `pnpm mobile:dev:lan` | Start Metro over LAN for an installed iPhone development app |
| `pnpm local:up` | Start DynamoDB Local, its GUI, and ElasticMQ; automatically initialize the table |
| `pnpm local:down` | Stop/remove all Compose containers; database volume survives, in-memory queue messages do not |
| `pnpm dev:webhook` | Start the signature-only webhook on loopback port 3002 |
| `pnpm dev:apple-webhook` | Start Apple sandbox notification ingress on port 3003 |
| `pnpm dev:worker` | Consume local subscription jobs and commit entitlements |
| `pnpm local:logs` | Show the latest logs for all Compose services; append `dynamodb`, `dynamodb-admin`, or `elasticmq` to select one |
| `pnpm stripe:listen` | Forward supported Stripe test events to the local webhook; requires Stripe CLI login |
| `pnpm synth` | Synthesize the CDK stack locally, including its Lambda asset; no deployment |
| `pnpm deploy:dev --dry-run` | Validate `infra/.env` and preview deployment commands without AWS requests |
| `pnpm bootstrap:dev` | Check the configured AWS account, then bootstrap its selected region |
| `pnpm deploy:dev` | Check the configured AWS account, then deploy `PremiumPassDev` |

The `local:*` commands replace the former `db:*`, `billing:up`, and `billing:logs` commands. `pnpm dev` groups the app processes; Stripe CLI and Mobile remain separate. Individual start commands remain available. For listener login and signing-secret setup, see [Stripe processing](docs/PAYMENTS.md#local-startup).

For deployment configuration and the one-time bootstrap step, see the [infrastructure guide](infra/README.md#development-deployment-scripts). Deployment scripts read `infra/.env`; they do not load the BFF configuration file.

Check Markdown links and consistency when changing documentation. `git diff --check` also checks tracked changes for whitespace issues; inspect new files separately.

The build produces `services/bff/dist/local.js` and `services/bff/dist/lambda.js` as ESM bundles for Node 24. Run `pnpm start` after `pnpm build` to launch the built local server. Webhook and worker each build `dist/local.js` and `dist/lambda.js` in their own service directory. Use `pnpm --filter @premiumpass/stripe-webhook run start` or `pnpm --filter @premiumpass/subscription-worker run start` to run a built service. Shared packages export TypeScript source for tsx and esbuild/CDK to consume, so development needs no separate library build watcher. The standalone Lambda export is `handler` (`lambda.handler` in an ESM package). CDK separately bundles the same source as `index.mjs` with deployment handler `index.handler`, including the pinned AWS SDK. `pnpm build` also typechecks infrastructure and exports the mobile iOS JavaScript bundle to `apps/mobile/dist`; it does not build the native iOS app. `pnpm synth` produces the deployable AWS assembly.

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

Reload the dashboard after each change. `expiring` grants 30 seconds of access; no subsequent event is needed for the API to deny access. The command only targets the Compose database and two explicitly marked demo records. It makes no purchase and cannot target AWS. See [subscription rules and manual scenarios](docs/PAYMENTS.md#access-policy) and the [DynamoDB model](docs/DYNAMODB_DATA_MODEL.md#subscriptions).

The app now requests `read:premium` as well as `read:me`. Ensure the API permission, user role, and application grant allow it, then **sign out and sign in again**. A valid scope alone does not grant Premium content. See the [Auth0 permission setup](docs/AUTH0_SETUP.md#3-configure-user-permissions-and-application-access).
