# PremiumPass Web

A small React + TypeScript SPA built with Vite, Tailwind CSS v4, and locally owned shadcn/ui components. It signs in with Auth0 and opens hosted Stripe test checkout through the local BFF. Follow the [Stripe and Auth0 setup](../../docs/STRIPE_SETUP.md) first.

```sh
# From the repository root; copy only if no local file exists yet.
cp apps/web/.env.example apps/web/.env
pnpm web:dev
```

Enter the public SPA values yourself. The server starts at `http://localhost:5173` and fails if that port is occupied. `pnpm dev` and `pnpm db:up` start the separate API and database. Restart Vite after environment changes. Missing web configuration renders setup instructions without starting an authentication flow. Never add a Stripe secret to this app.

## Structure

| Path                             | Responsibility                                                          |
| -------------------------------- | ----------------------------------------------------------------------- |
| `src/main.tsx`                   | React root, validated configuration, Auth0 provider                     |
| `src/App.tsx`                    | Session state and login/logout actions                                  |
| `src/hooks/use-api-client.ts`    | Memoized client; reads API origin and obtains tokens from Auth0         |
| `src/hooks/use-checkout.ts`      | Profile loading, pending state, per-user attempt UUID, checkout retries |
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
