# PremiumPass Web

A small React + TypeScript SPA built with Vite, Tailwind CSS v4, and locally owned shadcn/ui components. It signs in with Auth0, displays profile/subscription/access information, and opens hosted Stripe test checkout through the local BFF. Follow the [Stripe and Auth0 setup](../../docs/PAYMENTS.md#local-startup) first.

```sh
# From the repository root; copy only if no local file exists yet.
cp apps/web/.env.example apps/web/.env
pnpm web:dev
```

Enter the public SPA values yourself. The server starts at `http://localhost:5173` and fails if that port is occupied. `pnpm dev:api` and `pnpm local:up` start the separate API and database. Root `pnpm dev` starts the website together with BFF, webhook, worker, and Docker; use either that group or the individual commands, not both. Restart Vite after environment changes. Missing web configuration renders setup instructions without starting an authentication flow. Never add a Stripe secret to this app.

## Structure

| Path                             | Responsibility                                                          |
| -------------------------------- | ----------------------------------------------------------------------- |
| `src/main.tsx`                   | React root, validated configuration, Auth0 provider                     |
| `src/App.tsx`                    | Session state and login/logout actions                                  |
| `src/hooks/use-api-client.ts`    | Memoized client; reads API origin and obtains tokens from Auth0         |
| `src/hooks/use-checkout.ts`      | Pending state, per-user attempt UUID, checkout retries |
| `src/hooks/use-account.ts` | Profile, subscription, and entitlement loading; refresh, cancellation, and expiry rechecks |
| `src/api-models.ts` | Zod schemas and inferred types for backend responses |
| `src/components/account-details.tsx` | Auth0 session profile and internal account details |
| `src/components/subscription-status.tsx` | Backend access tier, subscription records, loading/error/empty states |
| `src/api-client.ts`              | Bearer requests, timeout, Zod response validation, safe API errors      |
| `src/components/demo-layout.tsx` | Responsive account/plan page and return/setup messages                  |
| `src/components/ui/`             | shadcn components copied into the repository and maintained locally     |
| `src/lib/utils.ts`               | Class-name composition with `cn`                                        |
| `src/style.css`                  | Tailwind entry and semantic theme tokens                                |
| `components.json`                | shadcn registry/style/path configuration                                |
| `vite.config.ts`                 | React/Tailwind plugins and `@/` source alias                            |

The web app uses Tailwind v4 independently of mobile's NativeWind/Tailwind v3. The theme is intentionally small. No router or server-state library is needed for the single page. Auth0 owns token caching in its built-in local-storage cache, so valid sessions survive reloads and checkout redirects. Session storage contains only a checkout attempt identifier, never credentials. The browser never grants Premium based on a query parameter.

To add a component deliberately, run the pinned CLI from the repository root:

```sh
pnpm dlx shadcn@4.21.4 add <component> -c apps/web
```

Review generated code and dependency changes, keep direct versions pinned, and run `pnpm check`. The production bundle is written to `apps/web/dist`; it is not deployed. Browser manual checks should include the unconfigured screen, sign-in/profile, pending/error feedback, checkout return/cancel, and narrow viewport layout. No automated tests are included.

Sources: [shadcn with Vite](https://ui.shadcn.com/docs/installation/vite), [Tailwind Vite plugin](https://tailwindcss.com/docs/installation/using-vite), [Auth0 React SDK](https://auth0.com/docs/quickstart/spa/react).

## Session restoration

The Auth0 provider uses `cacheLocation="localstorage"`. After switching from the previous memory cache, sign out and sign in once at `http://localhost:5173`, then reload. The same profile should reappear after the SDK finishes restoring the session. Stay on the same origin: `localhost` and `127.0.0.1` have separate browser storage. SDK logout clears its cached credentials.

Refresh tokens remain disabled. A valid cached access token can be reused; after expiry, silent renewal still depends on the Auth0 session and browser cookie policy. If renewal fails, sign in again. This change requires no tenant setting or `.env` change and does not extend token lifetime.

Persistent browser storage is readable by JavaScript on this origin, so an XSS vulnerability could expose cached tokens. This is a deliberate tradeoff for the local demo, not a production security recommendation. Use the SDK cache rather than manually storing tokens or inventing a logged-in flag. See [Auth0 storage options](https://auth0.com/docs/libraries/auth0-single-page-app-sdk#change-storage-options).

Manual check: sign in, note the internal user ID, reload twice, and verify the same profile. Then sign out and reload again; the app should remain signed out. Do not print cached credentials while checking.


## Profile and subscription status

The account card shows name, email, verification state, and subject from the existing Auth0 session, plus the internal user ID and creation time returned by `GET /v1/me`. Missing optional Auth0 claims are omitted. Tokens are never displayed.

`GET /v1/me/subscriptions` supplies each provider's records: normalized state, original provider status, product, verified access/grace boundaries, scheduled cancellation, last verification, and subscription ID. `GET /v1/me/entitlements` supplies the authoritative Free/Premium tier. An active-looking subscription or a Stripe success redirect alone does not grant Premium. All three endpoints use the existing `read:me` scope; no new Auth0 permission is needed for this display.

Account data loads after login and page restoration, on manual **Refresh account**, when the window regains focus or becomes visible, and at the backend's next entitlement boundary. Refreshing replaces the old snapshot with a loading state; failures show an explicit unavailable state instead of Free or stale Premium. **Next access recheck** is the earliest grant boundary, not necessarily the end of all access when several providers grant Premium. A new Auth0 identity remounts the account/checkout state, cancels account requests, and ignores results from the previous session.

The three reads are independent snapshots and can briefly straddle a worker update; refresh again if processing is still in flight. After returning from Stripe, wait for the webhook/worker and use **Refresh account**. There is no background checkout polling or browser-side entitlement calculation.

Manual walkthrough:

1. Sign in and compare the internal user ID with the mobile dashboard; reload and check that the same profile returns.
2. With no grants, verify **Free access** and the empty subscription message.
3. Complete an explicitly initiated Stripe test purchase, wait for processing, and refresh. Check Premium access, Stripe status, and the verified period against the mobile app.
4. After cancellation or another lifecycle update is processed, refresh and inspect both subscription state and backend access. Scheduled cancellation can coexist with access until its verified boundary.
5. If a read fails, verify the unavailable message and retry. Sign out to hide account data; signing in as a different demo user must not show the previous user's records.
6. Check the cards on a narrow viewport, including long subscription IDs and refresh controls.
