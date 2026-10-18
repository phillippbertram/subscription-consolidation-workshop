# Apple webhook

Receives Apple subscription events, such as renewals and cancellations, so changes
in Apple Sandbox are reflected in the PremiumPass database. It verifies each
notification and queues it for the [subscription worker](../subscription-worker/README.md),
which checks the current Apple state and updates subscriptions and access in the
database.

Verifies App Store Server Notifications V2 using public Apple certificates and
enqueues Sandbox subscription references. It needs no Auth0 token, database
access, or private key. Verified TEST notifications are acknowledged without jobs.

| Entry                           | Responsibility                                                       |
| ------------------------------- | -------------------------------------------------------------------- |
| `src/app.ts`                    | Signature verification, test/ignored notifications, queue acceptance |
| `src/runtime.ts`                | Shared local/cloud composition                                       |
| `src/local.ts`, `src/lambda.ts` | Loopback port 3003 / API Gateway handler                             |

`pnpm dev:webhook:apple` starts individually; `pnpm dev` includes it.
`GET /health` reports `appleEnabled`; disabled notification handling returns 503.
Follow [local ngrok setup](../../docs/APPLE_PURCHASES.md#receive-apple-notifications-through-ngrok)
or [AWS notification setup](../../docs/APPLE_PURCHASES.md#aws-notification-processing).
