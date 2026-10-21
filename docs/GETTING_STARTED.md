# Getting started

**Goal:** sign into the local website, make a Stripe test purchase, and see
backend-confirmed Premium access. Follow the steps in order, including the linked
provider setup. Commands use bash/zsh; run them from the repository root (the folder
containing `pnpm-workspace.yaml`). On Windows, use a WSL shell with Docker integration.

## 1. Prepare your tools and accounts

| Required                                                                                                     | Purpose                                                                        |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| Node **24.19.0**, pnpm **12.10.1**                                                                           | Versions pinned in `.nvmrc` and `package.json`                                 |
| [Docker with Compose](https://docs.docker.com/get-started/get-docker/)                                       | Local database and queue; Docker Desktop includes both                         |
| [Auth0 account](https://manage.auth0.com/)                                                                   | Permission to create a development tenant, API, applications, roles, and users |
| [Stripe account](https://dashboard.stripe.com/register) and [Stripe CLI](https://docs.stripe.com/stripe-cli) | A test environment where you can manage products and API keys                  |

Clone your copy of this repository, or open its extracted folder. There is no
public repository URL assumed by this guide. Install
[nvm](https://github.com/nvm-sh/nvm#installing-and-updating), reopen your terminal,
and enter the repository folder before running:

```sh
nvm install
nvm use
npm install --global pnpm@12.10.1
pnpm install --frozen-lockfile
```

**Check:** `node --version` and `pnpm --version` match the table. Start Docker
and confirm both `docker compose version` and `docker info` work. Run `nvm use`
in each new terminal. AWS and Xcode are not required for this path. The AWS and
store accounts for later modules are listed in [What you need](../README.md#what-you-need).

**Data:** no import or seed is required. First login creates the local profile;
checkout creates the owned Stripe customer/subscription. Score history is a
synthetic fixture in the API. Use fictional names and test payment details;
the login email must reach a mailbox you control for verification.

## 2. Create the configuration

All settings live in one ignored file, `config/.env`. Create it from the
template only when it does not exist yet:

```sh
[ -e config/.env ] || cp config/.env.example config/.env
```

Edit only this file in the next steps. `pnpm config:sync` writes the `.env`
file of every app and service from it, each with only the settings that
program reads ([who gets what](../config/targets.mjs)), and `pnpm dev` runs the
sync first on its own. Keep `APPLE_ENABLED=false` and
`GOOGLE_PLAY_ENABLED=false` for the initial Stripe path. Existing shell
variables still take precedence over the generated files.

Coming from an earlier version with one `.env` per service? Run
`pnpm config:import` once instead of copying the template: it builds
`config/.env` from those files and reports conflicting values by file name,
never by value.

## 3. Set up Auth0

Complete [Auth0: Web and API setup](AUTH0_SETUP.md#web-and-api-setup).
Create a Custom API, a Single Page Application, and synthetic users. Enable the
connection, assign the role, and authorize the SPA to request API scopes.

**Check:** you have the tenant domain, Custom API identifier, SPA Client ID,
and a synthetic user whose email is verified. Client ID and API audience are
different values; neither is a client secret.

## 4. Set up Stripe

Complete [Stripe test setup](PAYMENTS.md#stripe-test-setup). Create the daily and monthly
prices with lookup keys `premium_daily` and `premium_monthly`, sign into the CLI, and start `pnpm stripe:listen` in a separate terminal.
Keep it running and copy its signing secret into `STRIPE_WEBHOOK_SECRET` in
`config/.env`.

**Check:** API and worker use the same Stripe test environment and product.
The listener secret belongs to the local CLI, not a Dashboard webhook endpoint.

## 5. Connect the configuration

Replace the placeholders in `config/.env`. Browser values are public; the sync
sends Stripe keys and signing secrets only to the backend programs listed in
[config/targets.mjs](../config/targets.mjs). Remove the leading `#` from
`STRIPE_SECRET_KEY`, `STRIPE_PRODUCT_ID`, `STRIPE_MONTHLY_PRICE_LOOKUP_KEY`, and
`STRIPE_DAILY_PRICE_LOOKUP_KEY`; commented lines leave checkout disabled. Save
values as `NAME=value`, without placeholders. After later edits, run
`pnpm config:sync` (or restart `pnpm dev`) and restart the affected processes.

| Value / source                                          | Setting in `config/.env`          | Programs that receive it                                  |
| ------------------------------------------------------- | --------------------------------- | --------------------------------------------------------- |
| Auth0 domain, e.g. `your-tenant.eu.auth0.com`           | `AUTH0_DOMAIN`                    | Web and Mobile; API and AWS as issuer `https://<domain>/` |
| Custom API identifier                                   | `AUTH0_AUDIENCE`                  | API, Web, Mobile, AWS                                     |
| SPA Client ID                                           | `WEB_AUTH0_CLIENT_ID`             | Web                                                       |
| Stripe test secret key                                  | `STRIPE_SECRET_KEY`               | API, worker, CLI                                          |
| Stripe product ID (`prod_...`) from the product details | `STRIPE_PRODUCT_ID`               | API, worker, CLI                                          |
| Monthly lookup key (`premium_monthly`)                  | `STRIPE_MONTHLY_PRICE_LOOKUP_KEY` | API only                                                  |
| Daily lookup key (`premium_daily`)                      | `STRIPE_DAILY_PRICE_LOOKUP_KEY`   | API only                                                  |
| Signing secret printed by the running listener          | `STRIPE_WEBHOOK_SECRET`           | Stripe webhook only                                       |
| Website origin `http://localhost:5173`                  | `WEB_ORIGIN`                      | API; also add it to the Auth0 SPA allowlists              |
| API address `http://127.0.0.1:3000`                     | `WEB_API_URL`                     | Web                                                       |

Keep `API_PORT=3000` and `API_HOST=127.0.0.1`. The template already contains
the local database and queue defaults. Omitting `DYNAMODB_ENDPOINT` selects AWS
credential resolution, so retain it for this local path. The subscription CLI
receives the same Stripe key and product ID and needs no lookup key
([provider configuration](../apps/cli/README.md#configuration)).

**Check:** `pnpm config:sync` writes every file, and `pnpm config:check` then
reports that the configuration is valid and every generated file is current.
Both name settings and files, never values.

## 6. Start and make a test purchase

With Docker running and the Stripe listener in its own terminal:

```sh
pnpm dev
```

This initializes the local table and starts API, both webhook processes,
worker, website, and reconciliation watcher. Reconciliation runs immediately
and every five minutes using the CLI's provider settings. The Apple process
remains disabled for purchase handling.
Keep this terminal running; use a third terminal for the `curl` checks below.
Stop older individual processes first to avoid port conflicts. If startup exits,
fix the first failing process in the output; the grouped command stops its peers.

| Check                                                                                     | Expected result                                                                                                              |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `curl -i http://127.0.0.1:3000/health`                                                    | `200`, `{"status":"ok"}`; checks the HTTP process only                                                                       |
| `curl -i http://127.0.0.1:3000/v1/me`                                                     | `401` without a token                                                                                                        |
| Open `http://localhost:5173` and sign in                                                  | Account with an internal user ID and Free access                                                                             |
| Refresh the page                                                                          | Same internal user ID                                                                                                        |
| Start checkout with card `4242 4242 4242 4242`, any future expiry and any three-digit CVC | Test payment completes and returns to the website; use no real card ([Stripe test details](https://docs.stripe.com/testing)) |
| Wait for worker processing, then **Refresh account**                                      | Premium and a current Stripe subscription                                                                                    |

Stay on `localhost:5173` for the website; `127.0.0.1:5173` is a different browser
origin. If Vite selects another port, free port 5173 and restart. A checkout
redirect alone does not activate access. If Premium does not appear, follow
[payment diagnosis](PAYMENTS.md#manual-checks).

## 7. Continue or stop

- Follow the [learning path](../README.md#learning-path) module by module.
- Add native purchases: [Mobile](../apps/mobile/README.md),
  [Google Play](GOOGLE_PLAY.md), or [Apple Sandbox](APPLE_PURCHASES.md).
- Explore [concepts](CONCEPTS.md), [architecture](ARCHITECTURE.md), or [local development](DEVELOPMENT.md).
- Deploy supported components using the separate [AWS guide](../infra/README.md).
- Finish with [Cleanup](DEVELOPMENT.md#cleanup): pause processes, reset local
  data, or remove the project-specific integrations.
