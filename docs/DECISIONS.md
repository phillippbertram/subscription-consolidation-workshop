# Decisions

Confirmed direction and short rationale. This is not an implementation history;
status and evidence belong exclusively in [TASKS](TASKS.md).

## Agreed direction

| ID  | Decision                                           | Reason / consequence                                                                        |
| --- | -------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| D01 | React Native and Auth0                             | Real mobile login using a native development build                                          |
| D02 | Backend token and scope verification               | Same protection locally and in Lambda; no Gateway authorizer                                |
| D03 | AWS serverless, TypeScript, CDK                    | Small reproducible development stack; target architecture includes async processing         |
| D04 | Stripe test mode, real Apple Sandbox, Google mocks | Learn provider integration without production purchases; Apple prioritized October 13, 2026 |
| D05 | Central subscriptions and entitlements             | One backend policy combines all valid grants                                                |
| D06 | Small hands-on project                             | One Premium product; no extra admin platform                                                |
| D07 | Hono                                               | Shared Node/Lambda HTTP composition; no framework in workers/domain                         |
| D08 | No automated tests/framework                       | Verify with formatting, lint, types, builds, and manual flows                               |
| D09 | English project text                               | Consistent code, configuration, documentation, and records                                  |
| D10 | Gateway default API integration                    | Hono owns user routes; explicit provider webhook routes take precedence                     |
| D11 | pnpm workspace per executable service              | Independent configuration and deployment entries; share only needed packages                |

## Implementation choices

| Area                 | Confirmed choice                                                                                                                   |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Toolchain            | Versions pinned in `.nvmrc`, manifests, and lockfile; ESLint + Prettier; mandatory braces and logical spacing                      |
| Authentication       | `jose`, RS256, fixed issuer/audience/JWKS; verified scopes; no silent mock fallback                                                |
| User ownership       | Hash exact verified issuer/subject; internal UUID; no email-based linking                                                          |
| Storage              | DynamoDB access patterns and conditional transactions; one table; local database explicitly selected                               |
| Service structure    | API, Stripe webhook, Apple webhook, worker; local and Lambda adapters stay in their service                                        |
| Shared code          | HTTP contracts separate from queue/domain schemas; AWS factories have no environment reads or global registry                      |
| Web                  | React/Vite, Tailwind v4, locally owned shadcn UI; SDK local-storage token cache for demo reloads; no refresh tokens                |
| Mobile               | Expo, SDK secure credentials, Axios/Zod API client, session-isolated TanStack Query cache; feature folders; Gluestack/NativeWind v4 with Tailwind v3 |
| Dashboard            | Fixed dark theme, score-first layout, Account modal, collapsed developer tools; subscription details separated from current grants |
| Apple                | Direct `expo-iap` and official Apple server library; Sandbox only; no RevenueCat; internal UUID as `appAccountToken`               |
| Purchase completion  | Finish StoreKit transaction only after committed backend operation; immutable owner binding                                        |
| Cancellation         | Stripe period-end cancellation verifies ownership; Apple uses native management; access follows verified provider state            |
| Duplicate exercises  | Default-off, nonpersistent development Sandbox override affects UI eligibility only                                                |
| Local administration | Fixed DynamoDB Local target; Stripe reconciliation reads provider state through the existing processor; preview with `--dry-run`   |
| Documentation        | Local-first setup; one owner per topic; provider extensions and explicit pause/reset/removal guidance                              |

Provider grace and outage behavior are defined only in the
[access policy](PAYMENTS.md#access-policy). Architecture and code entry points
are in [ARCHITECTURE](ARCHITECTURE.md); external setup is in the provider guides.

## Open decisions

- Select and authorize the actual AWS development account/profile/region before
  live work; examples do not select an account.
- Choose the remote repository and OIDC trust context when implementing P10.
- Evaluate additional platforms, routing/caching libraries, or production billing
  concerns only when a new task requires them.

Configured local credentials, a chosen Apple product, and successful local builds
do not settle these live/deployment questions. Keep secret values out of decisions.
