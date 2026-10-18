# PremiumPass API

Hono service for authenticated profile, subscription, score, and billing requests.
Use [Getting started](../../docs/GETTING_STARTED.md) for setup and
[Development](../../docs/DEVELOPMENT.md) for startup/logging commands.

## Request flow

1. Attach metadata/logging, handle CORS preflight, and expose public `/health`.
2. Verify the access token and reject machine identities before user routes.
3. Check route scopes/input, resolve the internal user, then call services/stores.
4. Premium routes additionally evaluate current subscription grants.

Unknown routes return 401 without authentication and 404 for an authenticated
user. Errors include `error.code` / `error.requestId`; responses carry
`X-Request-Id` and `Cache-Control: no-store`. Health checks only the HTTP process.

## Authentication

`jose` verifies RS256, exact issuer/audience, required expiry/subject and optional
`nbf`, with five seconds of clock tolerance. A nonempty `kid` selects keys only
from the configured issuer's fixed JWKS URL; token-provided URLs are ignored.

| Condition                                  | Response                             |
| ------------------------------------------ | ------------------------------------ |
| Missing/invalid access token               | 401                                  |
| Missing scope or machine identity          | 403                                  |
| JWKS unavailable with no usable cached key | 503; retry after 30 seconds          |
| Persistence/schema failure                 | 500; no fabricated profile or access |

Resolvers are reused per app instance: ten-minute cache, five-second retrieval
timeout, 30-second refresh cooldown including failed fetches. Valid cached keys
can survive an outage; expired keys are not a fallback. Scope alone never grants
Premium. See [Auth0 setup/checks](../../docs/AUTH0_SETUP.md).

## Structure

| Entry                                                         | Responsibility                                                       |
| ------------------------------------------------------------- | -------------------------------------------------------------------- |
| `src/app.ts`                                                  | Compose middleware, routes, errors, and dependencies                 |
| `src/routes/`                                                 | Users, subscriptions, Premium, Stripe, Apple, Google HTTP boundaries |
| `src/auth.ts`, `src/config.ts`                                | Token/scope checks and startup validation                            |
| `src/billing/`                                                | Billing services and provider/ownership/queue adapters               |
| `src/users.ts`, `src/dynamodb-users.ts`, `src/persistence.ts` | Identity/profile contract and stores                                 |
| `src/local.ts`, `src/lambda.ts`                               | Local runtime / API Gateway handler                                  |
| `scripts/init-local-db.ts`                                    | Initialize the fixed local table                                     |

Register new user routes after shared authentication; declare scopes explicitly.
Keep Hono contexts out of domain/services. Reuse [HTTP contracts](../../packages/api-contracts/README.md)
for inputs and successful response types. Cloud billing composition differs from
local: consult [infrastructure boundaries](../../infra/README.md#resources-and-boundaries).

## Endpoint guide

Google billing uses the same routes in local and Lambda runtimes when explicitly
enabled. Purchase and Restore submit the same strict token-only request; the
internal owner comes from the verified Auth0 identity, never from request input.
The API returns 202 only after confirmed queue acceptance. Polling reports
`completed` only for the operation's owner after durable worker completion,
including Google acknowledgement. Missing, unfinished, or another user's operations
all report `pending`. The API holds no Google service-account key and creates no
grants. Sync bodies over 8 KiB return 413 with `google_request_too_large`.
[Local setup](../../docs/GOOGLE_PLAY.md#7-enable-local-processing) ·
[Cloud setup](../../docs/GOOGLE_PLAY.md#authenticated-cloud-purchase-and-restore).

| Path                                                  | Purpose / requirement                                                            |
| ----------------------------------------------------- | -------------------------------------------------------------------------------- |
| `GET /v1/me`                                          | Own profile; `read:me`                                                           |
| `GET /v1/me/subscriptions`, `GET /v1/me/entitlements` | Own records and current access; `read:me`                                        |
| `GET /v1/premium/score-history`                       | Synthetic history; `read:premium` plus valid grant                               |
| Stripe checkout/cancellation routes                   | [Payment contract and checks](../../docs/PAYMENTS.md#checkout-and-recovery)      |
| Apple config/sync/completion routes                   | [Apple processing](../../docs/APPLE_PURCHASES.md#processing-and-ownership)       |
| `GET /v1/billing/google/config`                       | Public product settings and own store-account UUID; `read:me` + `write:checkout` |
| `POST /v1/billing/google/sync`                        | Purchase/Restore token → queued operation; `write:checkout`                      |
| `GET /v1/billing/google/sync/:operationId`            | Own durable completion status; `read:me`                                         |
