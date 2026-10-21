# PremiumPass Web

React/Vite website for Auth0 login, the Premium score history, Stripe test
checkout, and period-end cancellation. Follow the [local setup](../../docs/setup/README.md)
for configuration and the first purchase.

## Run

`pnpm dev` includes Web at `http://localhost:5173`. Use `pnpm dev:web` only when
starting services individually. Restart Vite after `.env` changes; missing
configuration shows a setup message. Never put Stripe secrets in `VITE_` values.

## Pages

| URL        | Signed out                                    | Signed in                                                          |
| ---------- | --------------------------------------------- | ------------------------------------------------------------------ |
| `/`        | Landing page: features, pricing, FAQ, sign-in | Overview: score history (Premium) and membership summary           |
| `/billing` | Landing page; sign-in returns here            | Current plan and access sources, plan choice, subscription history |
| `/account` | Landing page; sign-in returns here            | Profile, developer identifiers, sign-out                           |

Stripe returns to `/?checkout=success|cancel`; the website shows that return on
`/billing`. Auth0 always redirects to the origin, and `appState.returnTo`
reopens the page where sign-in started. `src/lib/navigation.tsx` is a small
History API wrapper instead of a router library, because three fixed pages need
no nested routes or loaders.

## Structure

| Area                                             | Responsibility                                                            |
| ------------------------------------------------ | ------------------------------------------------------------------------- |
| `src/main.tsx`, `src/App.tsx`                    | Auth0 provider, session-dependent page selection                          |
| `src/features/landing/`                          | Signed-out marketing page; static example content only                    |
| `src/features/overview/`, `src/features/scores/` | Signed-in overview and the Premium score history                          |
| `src/features/account/`                          | Profile, identifiers, account loading and refresh                         |
| `src/features/subscriptions/`                    | Billing page: checkout, cancellation, status and history                  |
| `src/api/`                                       | Auth0 token bridge, transport, shared response validation                 |
| `src/components/`, `src/lib/`, `src/style.css`   | App shell, locally owned shadcn components, navigation, Tailwind v4 theme |

[HTTP contracts](../../packages/api-contracts/README.md) are shared with Mobile
and the API. Mobile uses its own NativeWind/Tailwind version.

## Behavior and manual checks

| Flow                 | Check                                                                                           |
| -------------------- | ----------------------------------------------------------------------------------------------- |
| Signed out           | Landing page on every URL; **Sign in** returns to the same page, **Get Premium** to Billing     |
| Login and reload     | Same internal user ID after SDK session restoration                                             |
| Score history        | Premium loads `/v1/premium/score-history`; Free shows the locked teaser, never data             |
| Billing choice       | Daily/monthly selection sends the matching plan; amount is reviewed in Checkout                 |
| Checkout recovery    | Selection stays locked to the saved attempt across retry/reload; a new attempt unlocks it       |
| Checkout return      | `/billing` with a return notice; refresh after worker processing; redirect alone grants nothing |
| Current subscription | Backend tier and valid grants; previous records only in the history                             |
| Cancellation         | Confirmation, retry feedback, renewal disabled, paid access preserved                           |
| Refresh failure      | Unavailable state rather than stale Premium or fabricated Free                                  |
| Identity change      | Previous account data disappears; new user's records only                                       |
| Narrow viewport      | Navigation, cards, dialogs, long IDs, and Close actions remain usable                           |

**Refresh account** also runs on foreground and access boundaries. Independent
reads can briefly straddle a worker update; refresh again if processing is in
flight. **Start a new attempt** clears the saved browser attempt and unlocks the
billing choice, while the backend still checks whether another purchase is allowed.

Auth0 uses its SDK local-storage cache for this demo; JavaScript on the origin
can access it, so this is not a production token-storage recommendation. Keep the
same website origin. Refresh tokens are disabled; if silent renewal fails, sign
in again. The website requests `read:me read:premium write:checkout`; after
the scope list changes, sign out and in again. Session storage holds checkout
request IDs and plan IDs, not separately stored tokens. Older UUID-only entries
represent monthly attempts. The checkout hook
uses named reducer transitions so selection, recovery, and pending UI stay together.

## Cleanup

Sign out and, if desired, clear only this website's browser data. This does not
cancel provider subscriptions. See [Stripe cleanup](../../docs/setup/stripe.md#cleanup)
and [environment cleanup](../../docs/DEVELOPMENT.md#cleanup).
