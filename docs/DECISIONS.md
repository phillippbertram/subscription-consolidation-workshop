# Decisions

Confirmed direction and short rationale. This is not an implementation history;
status belongs in [TASKS](TASKS.md).

## Agreed direction

| ID  | Decision                                       | Reason / consequence                                                                                                                                       |
| --- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D01 | React Native and Auth0                         | Real mobile login using a native development build                                                                                                         |
| D02 | Backend token and scope verification           | Same protection locally and in Lambda; no Gateway authorizer                                                                                               |
| D03 | AWS serverless, TypeScript, CDK                | Small reproducible development stack; target architecture includes async processing                                                                        |
| D04 | Stripe test mode and real store test purchases | Google Play license tests and Apple Sandbox, never production purchases                                                                                    |
| D05 | Central subscriptions and entitlements         | One backend policy combines all valid grants                                                                                                               |
| D06 | Small hands-on project                         | One Premium product; no extra admin platform                                                                                                               |
| D07 | Hono                                           | Shared Node/Lambda HTTP composition; no framework in workers/domain                                                                                        |
| D08 | No automated tests/framework                   | Verify with formatting, lint, types, builds, and manual flows                                                                                              |
| D09 | English project text                           | Consistent code, configuration, documentation, and records                                                                                                 |
| D10 | Gateway default API integration                | Hono owns user routes; explicit provider webhook routes take precedence                                                                                    |
| D11 | pnpm workspace per executable                  | Independent configuration and deployment entries; share only needed packages                                                                               |
| D12 | Complimentary Premium through admin grants     | Selected users can receive access without payment; independent, auditable, revocable grants with optional expiry; no additional admin platform             |
| D13 | One configuration source, generated `.env`     | Edit only `config/.env`; `pnpm config:sync` writes each executable's `.env` from `config/targets.mjs`, so every program still gets only its settings (D11) |
| D14 | Local admin console                            | `apps/admin` web app plus `/admin` routes in the local API entry only, behind a manually set `ADMIN_SECRET`; no admin route in Lambda, no Auth0 admin role |

## Implementation choices

| Area                 | Confirmed choice                                                                                                                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Toolchain            | Versions pinned in `.nvmrc`, manifests, and lockfile; ESLint + Prettier; mandatory braces and logical spacing                                                                                                |
| Authentication       | `jose`, RS256, fixed issuer/audience/JWKS; verified scopes; no silent mock fallback                                                                                                                          |
| User ownership       | Hash exact verified issuer/subject; internal UUID; no email-based linking                                                                                                                                    |
| Storage              | DynamoDB access patterns and conditional transactions; one table; local database explicitly selected                                                                                                         |
| Service structure    | Executable clients/tools in apps, backend transports in services; local and Lambda adapters stay in their service                                                                                            |
| Shared code          | HTTP contracts separate from queue/domain schemas; AWS factories have no environment reads or global registry                                                                                                |
| Web                  | React/Vite, Tailwind v4, locally owned shadcn UI; SDK local-storage token cache for demo reloads; no refresh tokens                                                                                          |
| Mobile               | Expo, SDK secure credentials, Axios/Zod API client, session-isolated TanStack Query cache; feature folders; Gluestack/NativeWind v4 with Tailwind v3                                                         |
| Dashboard            | Light theme shared by Web and Mobile; Overview, Billing, and Account as Web pages and mobile tabs; score-first overview; collapsed developer tools; history separate from current access                     |
| Apple                | Direct `expo-iap` and official Apple server library; Sandbox only; no RevenueCat; internal UUID as `appAccountToken`                                                                                         |
| Google Play          | Direct Android `expo-iap`; one auto-renewing base plan, no offers; Developer API verification; internal UUID as `obfuscatedAccountId`; license tests only                                                    |
| Google completion    | Commit state, outbox, and acknowledgement intent first, then acknowledge with Google; owner-bound completion polling; authenticated Pub/Sub RTDN                                                             |
| Purchase completion  | Worker finishes the Apple transaction after the commit; a durable finish target closes the crash window; the app waits for the recorded finish                                                               |
| Stripe pricing       | One Premium product with daily/monthly Stripe test prices; resolve the selected lookup key and persist plan/price per attempt; recognize paid subscriptions by configured product, including archived prices |
| Cancellation         | Stripe period-end cancellation verifies ownership; Apple uses native management; access follows verified provider state                                                                                      |
| Duplicate exercises  | Default-off, nonpersistent development Sandbox override affects UI eligibility only                                                                                                                          |
| Local administration | CLI in `apps/cli` and the admin console (D14), both on the shared processing package and the fixed DynamoDB Local target; preview before every write                                                         |
| Cloud reconciliation | One five-minute rule, one opt-in Lambda per provider; discovery never writes; the worker verifies; separate failure queue                                                                                    |
| Documentation        | Local-first setup; one owner per topic; provider extensions and explicit pause/reset/removal guidance                                                                                                        |
| Documentation site   | VitePress default theme in `apps/docs` renders `docs/` in place; Markdown stays GitHub-compatible; one route rule for URLs and links; code links open on GitHub; published to GitHub Pages                   |

Provider grace and outage behavior are defined only in the
[access policy](PAYMENTS.md#access-policy). Architecture and code entry points
are in [ARCHITECTURE](ARCHITECTURE.md); external setup is in the provider guides.

Complimentary Premium uses the local CLI or the local admin console: one grant
per user, a required reason, the OS user as actor, and repeat-safe request IDs.
Access to the local machine and database is the trust boundary; the console's
shared secret guards the local API route and names no person. There is no Auth0
admin role and no admin endpoint in AWS.
[Commands and limitations](DEVELOPMENT.md#complimentary-premium) ·
[Admin console](ADMIN_CONSOLE.md).

## Open decisions

- Select and authorize the actual AWS development account/profile/region before
  live work; examples do not select an account.
- Evaluate additional platforms, routing/caching libraries, or production billing
  concerns only when a new task requires them.

Configured local credentials, a chosen Apple product, and successful local builds
do not settle these live/deployment questions. Keep secret values out of decisions.
