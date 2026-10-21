# Workspace

Install the toolchain, start Docker, and create the one configuration file.
**Afterwards:** dependencies are installed, Docker works, and `config/.env`
exists. [Auth0](auth0.md) and [Stripe](stripe.md) fill in its values next.

Commands use bash/zsh; run them from the repository root (the folder containing
`pnpm-workspace.yaml`). On Windows, use a WSL shell with Docker integration.

## 1. Prepare your tools

| Required                                                               | Purpose                                                |
| ---------------------------------------------------------------------- | ------------------------------------------------------ |
| Node **24.19.0**, pnpm **12.10.1**                                     | Versions pinned in `.nvmrc` and `package.json`         |
| [Docker with Compose](https://docs.docker.com/get-started/get-docker/) | Local database and queue; Docker Desktop includes both |

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
in each new terminal. AWS and Xcode are not required for this path. Accounts for
every step are listed in the [setup overview](README.md#accounts).

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
program reads ([who gets what](../../config/targets.mjs)), and `pnpm dev` runs the
sync first on its own. Keep `APPLE_ENABLED=false` and
`GOOGLE_PLAY_ENABLED=false` for the initial Stripe path. Existing shell
variables still take precedence over the generated files.

Coming from an earlier version with one `.env` per service? Run
`pnpm config:import` once instead of copying the template: it builds
`config/.env` from those files and reports conflicting values by file name,
never by value.

## 3. Keep the local defaults

The template already contains the local values below; keep them for this path.
Omitting `DYNAMODB_ENDPOINT` selects AWS credential resolution, so retain it.

| Setting in `config/.env`       | Local value             | Programs that receive it              |
| ------------------------------ | ----------------------- | ------------------------------------- |
| `API_PORT`, `API_HOST`         | `3000`, `127.0.0.1`     | API                                   |
| `WEB_ORIGIN`                   | `http://localhost:5173` | API; also in the Auth0 SPA allowlists |
| `WEB_API_URL`                  | `http://127.0.0.1:3000` | Web                                   |
| `DYNAMODB_ENDPOINT` and queues | Local Docker services   | Backend services and the CLI          |

Save every value as `NAME=value`, without placeholders. After later edits, run
`pnpm config:sync` (or restart `pnpm dev`) and restart the affected processes.

**Next:** [Auth0](auth0.md).
