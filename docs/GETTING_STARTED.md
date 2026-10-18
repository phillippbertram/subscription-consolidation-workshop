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
in each new terminal. AWS and Xcode are not required for this path.

**Data:** no import or seed is required. First login creates the local profile;
checkout creates the owned Stripe customer/subscription. Score history is a
synthetic fixture in the API. Use fictional names and test payment details;
the login email must reach a mailbox you control for verification.

## 2. Create local configuration files

This loop copies examples only when the corresponding file does not exist:

```sh
for directory in services/api services/stripe-webhook services/apple-webhook services/subscription-worker apps/web; do
  if [ ! -e "$directory/.env" ]; then
    cp "$directory/.env.example" "$directory/.env"
  fi
done
```

Edit these ignored files with your own values in the next steps. Keep Apple
settings disabled (`APPLE_ENABLED=false`) for the initial Stripe path.
Each process loads its own `.env`; existing shell variables take precedence.

## 3. Set up Auth0

Complete [Auth0: Web and API setup](AUTH0_SETUP.md#web-and-api-setup).
Create a Custom API, a Single Page Application, and synthetic users. Enable the
connection, assign the role, and authorize the SPA to request API scopes.

**Check:** you have the tenant domain, Custom API identifier, SPA Client ID,
and a synthetic user whose email is verified. Client ID and API audience are
different values; neither is a client secret.

## 4. Set up Stripe

Complete [Stripe test setup](PAYMENTS.md#stripe-test-setup). Create the monthly
price, sign into the CLI, and start `pnpm stripe:listen` in a separate terminal.
Keep it running and copy its signing secret into the webhook configuration.

**Check:** API and worker use the same Stripe test environment and price.
The listener secret belongs to the local CLI, not a Dashboard webhook endpoint.

## 5. Connect the configuration

Replace placeholders in these files. Browser values are public; Stripe keys
and signing secrets belong only in the indicated backend files. In
`services/api/.env`, remove the leading `#` from **both** `STRIPE_SECRET_KEY`
and `STRIPE_PRICE_ID`; commented lines leave checkout disabled. Save values as
`NAME=value`, without placeholders, and restart services after later edits.

| Value / source                                                       | Destination                                                |
| -------------------------------------------------------------------- | ---------------------------------------------------------- |
| Auth0 domain, e.g. `your-tenant.eu.auth0.com`                        | `apps/web/.env`: `VITE_AUTH0_DOMAIN`                       |
| Same domain as HTTPS issuer, ending in `/`                           | `services/api/.env`: `AUTH0_ISSUER`                        |
| Custom API identifier                                                | API: `AUTH0_AUDIENCE`; Web: `VITE_AUTH0_AUDIENCE`          |
| SPA Client ID                                                        | Web: `VITE_AUTH0_CLIENT_ID`                                |
| Stripe test secret key                                               | API and worker: `STRIPE_SECRET_KEY`                        |
| Stripe recurring price ID                                            | API and worker: `STRIPE_PRICE_ID`                          |
| Signing secret printed by the running listener                       | Stripe webhook: `STRIPE_WEBHOOK_SECRET`                    |
| Website origin `http://localhost:5173`                               | API: `WEB_ORIGIN`; Auth0 SPA allowlists                    |
| API address `http://127.0.0.1:3000`                                  | Web: `VITE_API_URL`                                        |
| Local table `premiumpass-local` and endpoint `http://127.0.0.1:8000` | API and worker: `DYNAMODB_TABLE_NAME`, `DYNAMODB_ENDPOINT` |
| Local queue from the examples                                        | Both webhooks, API, and worker: `SUBSCRIPTION_QUEUE_URL`   |

Keep API `PORT=3000` and `HOST=127.0.0.1`. The examples already contain the local
database and queue defaults. Omitting the database endpoint selects AWS
credential resolution, so retain it for this local path.

For optional subscription CLI tools, copy `apps/cli/.env.example` to
`apps/cli/.env` and configure the same Stripe test key and price there. The CLI
has its own [provider configuration](../apps/cli/README.md#configuration) and
does not read the worker's `.env`.

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
