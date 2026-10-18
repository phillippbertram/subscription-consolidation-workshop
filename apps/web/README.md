# PremiumPass Web

React/Vite website for Auth0 login, account access, Stripe test checkout, and
period-end cancellation. Follow [Getting started](../../docs/GETTING_STARTED.md)
for configuration and the first purchase.

## Run

`pnpm dev` includes Web at `http://localhost:5173`. Use `pnpm dev:web` only when
starting services individually. Restart Vite after `.env` changes; missing
configuration shows a setup message. Never put Stripe secrets in `VITE_` values.

## Structure

| Area                               | Responsibility                                                       |
| ---------------------------------- | -------------------------------------------------------------------- |
| `src/main.tsx`, `src/App.tsx`      | Auth0 provider and session-dependent composition                     |
| `src/features/account/`            | Profile, session details, account loading and refresh                |
| `src/features/subscriptions/`      | Checkout, cancellation, status and details                           |
| `src/api/`                         | Auth0 token bridge, transport, shared response validation            |
| `src/components/`, `src/style.css` | Page composition, locally owned shadcn components, Tailwind v4 theme |

[HTTP contracts](../../packages/api-contracts/README.md) are shared with Mobile
and the API. Mobile uses its own NativeWind/Tailwind version.

## Behavior and manual checks

| Flow                 | Check                                                                 |
| -------------------- | --------------------------------------------------------------------- |
| Login and reload     | Same internal user ID after SDK session restoration                   |
| Checkout return      | Refresh after worker processing; redirect alone grants nothing        |
| Current subscription | Backend tier and valid grants; previous records only in details       |
| Cancellation         | Confirmation, retry feedback, renewal disabled, paid access preserved |
| Refresh failure      | Unavailable state rather than stale Premium or fabricated Free        |
| Identity change      | Previous account data disappears; new user's records only             |
| Narrow viewport      | Cards, dialogs, long IDs, and Close actions remain usable             |

**Refresh account** also runs on foreground and access boundaries. Independent
reads can briefly straddle a worker update; refresh again if processing is in
flight. **Start a new attempt** clears the browser attempt ID, while the backend
still checks whether another purchase is allowed.

Auth0 uses its SDK local-storage cache for this demo; JavaScript on the origin
can access it, so this is not a production token-storage recommendation. Keep the
same website origin. Refresh tokens are disabled; if silent renewal fails, sign
in again. Session storage holds checkout attempt IDs, not separately stored tokens.

## Cleanup

Sign out and, if desired, clear only this website's browser data. This does not
cancel provider subscriptions. See [Stripe cleanup](../../docs/PAYMENTS.md#cleanup)
and [environment cleanup](../../docs/DEVELOPMENT.md#cleanup).
