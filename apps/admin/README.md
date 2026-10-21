# PremiumPass Admin console

Local-only React/Vite console that shows what the backend knows right now:
users, subscriptions, admin grants, computed access versus stored snapshots,
outbox entries, processing markers, and queues. Actions (complimentary Premium,
refresh, expiration, DLQ redrive) always preview first. What it shows and how
it is protected: [Admin console guide](../../docs/ADMIN_CONSOLE.md).

## Run

Set `ADMIN_SECRET` in `config/.env`, restart the local API, then:

```sh
pnpm dev:admin
```

Open `http://localhost:5175` and enter the secret. `pnpm dev:admin` syncs
`config/.env` first; `apps/admin/.env` receives only `ADMIN_API_URL`, the API
origin the dev server forwards `/admin/*` to. There is no hosted build: the
console exists to inspect the local stack.

## Structure

| Area                                                         | Responsibility                                                      |
| ------------------------------------------------------------ | ------------------------------------------------------------------- |
| `src/App.tsx`, `src/components/secret-gate.tsx`              | Ask for the secret, keep it in `sessionStorage`, pick the page      |
| `src/api/`                                                   | Fetch `/admin/*` with the secret header; one state read per reload  |
| `src/features/overview/`, `users/`, `outbox/`, `processing/` | The five pages; display and filter only                             |
| `src/features/users/actions.tsx`                             | Preview-then-apply forms with stable request and run IDs            |
| `src/features/activity.ts`                                   | Merge markers, audits, checkouts, and outbox entries into timelines |
| `src/components/ui/`, `src/style.css`                        | Locally owned shadcn components and the website's light theme       |

The API computes every value; the console never decides access itself. Routes
and checks live in [`services/api/src/admin/`](../../services/api/src/admin/routes.ts);
shared schemas in [`@premiumpass/api-contracts/admin`](../../packages/api-contracts/src/admin.ts).
`src/lib/navigation.tsx` is a small History API wrapper, like the website's.
Page paths never start with `/admin`, which belongs to the API proxy.
