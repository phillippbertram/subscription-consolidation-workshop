# Decisions

Confirmed direction and short rationale. This is not an implementation history;
status and evidence belong exclusively in [TASKS](TASKS.md).

## Agreed direction

| ID  | Decision                                       | Reason / consequence                                                                                                                               |
| --- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| D01 | React Native and Auth0                         | Real mobile login using a native development build                                                                                                 |
| D02 | Backend token and scope verification           | Same protection locally and in Lambda; no Gateway authorizer                                                                                       |
| D03 | AWS serverless, TypeScript, CDK                | Small reproducible development stack; target architecture includes async processing                                                                |
| D04 | Stripe test mode and real store test purchases | Google Play license-test purchases prioritized October 18, 2026; Apple Sandbox deferred due to account issues; local Google mocks remain available |
| D05 | Central subscriptions and entitlements         | One backend policy combines all valid grants                                                                                                       |
| D06 | Small hands-on project                         | One Premium product; no extra admin platform                                                                                                       |
| D07 | Hono                                           | Shared Node/Lambda HTTP composition; no framework in workers/domain                                                                                |
| D08 | No automated tests/framework                   | Verify with formatting, lint, types, builds, and manual flows                                                                                      |
| D09 | English project text                           | Consistent code, configuration, documentation, and records                                                                                         |
| D10 | Gateway default API integration                | Hono owns user routes; explicit provider webhook routes take precedence                                                                            |
| D11 | pnpm workspace per executable          | Independent configuration and deployment entries; share only needed packages                                                                       |
| D12 | Complimentary Premium through admin grants     | Selected users can receive access without payment; independent, auditable, revocable grants with optional expiry; no additional admin platform     |

## Implementation choices

| Area                        | Confirmed choice                                                                                                                                                                                                             |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Toolchain                   | Versions pinned in `.nvmrc`, manifests, and lockfile; ESLint + Prettier; mandatory braces and logical spacing                                                                                                                |
| Authentication              | `jose`, RS256, fixed issuer/audience/JWKS; verified scopes; no silent mock fallback                                                                                                                                          |
| User ownership              | Hash exact verified issuer/subject; internal UUID; no email-based linking                                                                                                                                                    |
| Storage                     | DynamoDB access patterns and conditional transactions; one table; local database explicitly selected                                                                                                                         |
| Service structure           | Executable clients/tools in apps, backend transports in services; local and Lambda adapters stay in their service                                                                                                                                  |
| Shared code                 | HTTP contracts separate from queue/domain schemas; AWS factories have no environment reads or global registry                                                                                                                |
| Web                         | React/Vite, Tailwind v4, locally owned shadcn UI; SDK local-storage token cache for demo reloads; no refresh tokens                                                                                                          |
| Mobile                      | Expo, SDK secure credentials, Axios/Zod API client, session-isolated TanStack Query cache; feature folders; Gluestack/NativeWind v4 with Tailwind v3                                                                         |
| Dashboard                   | Fixed dark theme, score-first layout, Account modal, collapsed developer tools; subscription details separated from current grants                                                                                           |
| Apple                       | Direct `expo-iap` and official Apple server library; Sandbox only; no RevenueCat; internal UUID as `appAccountToken`                                                                                                         |
| Google Play                 | Direct Android `expo-iap`, one auto-renewing base plan without offers; official Google auth library, Developer API verification, random internal UUID as `obfuscatedAccountId`; license-test purchases only                  |
| Google completion           | Atomic state/outbox/acknowledgement intent before backend Google acknowledgement; durable owner-bound completion polling and authenticated Pub/Sub RTDN; local and optional AWS config/sync/worker wiring                    |
| Purchase completion         | Worker finishes with Apple after the atomic commit; durable finish target and queue retries close the crash window; app waits for recorded finish                                                                            |
| Cancellation                | Stripe period-end cancellation verifies ownership; Apple uses native management; access follows verified provider state                                                                                                      |
| Duplicate exercises         | Default-off, nonpersistent development Sandbox override affects UI eligibility only                                                                                                                                          |
| Local administration        | CLI in apps/cli, shared provider processing in packages/subscription-processing; fixed DynamoDB Local target, existing Stripe processor, and --dry-run preview                                                                                             |
| Cloud Google reconciliation | Five-minute opt-in discovery of known token owners; no provider key or state writes in discovery; fresh verification in the existing worker; paginated small-table scan, stable schedule/run job IDs, separate failure queue |
| Documentation               | Local-first setup; one owner per topic; provider extensions and explicit pause/reset/removal guidance                                                                                                                        |

Provider grace and outage behavior are defined only in the
[access policy](PAYMENTS.md#access-policy). Architecture and code entry points
are in [ARCHITECTURE](ARCHITECTURE.md); external setup is in the provider guides.

## Open decisions

- Select and authorize the actual AWS development account/profile/region before
  live work; examples do not select an account.
- Evaluate additional platforms, routing/caching libraries, or production billing
  concerns only when a new task requires them.

Configured local credentials, a chosen Apple product, and successful local builds
do not settle these live/deployment questions. Keep secret values out of decisions.
