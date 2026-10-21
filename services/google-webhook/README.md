# Google Play notification ingress

Local Hono service on `127.0.0.1:3004`, started by `pnpm dev` or alone with
`pnpm dev:webhook:google`. Follow [Google Play setup](../../docs/GOOGLE_PLAY.md).

`POST /v1/webhooks/google` accepts wrapped, authenticated Pub/Sub push messages.
The official Google auth library verifies signature, issuer, audience, and time;
the service additionally checks verified service-account email, subscription,
package, payload shape, and a stable Pub/Sub message ID. A successful subscription
or voided-subscription notification response follows confirmed queue acceptance.
TEST and unrelated one-time-product messages have no domain effect.

RTDN carries a purchase reference, never trusted entitlement state. The worker
rereads Google, requires a license-test purchase and verified owner, and commits
before purchase acknowledgement. Raw tokens remain in the private queue and
backend provider record; ingress logs contain IDs only.

Set the shared Google product settings and the push identity values in
`config/.env`; `pnpm config:sync` writes this service's `.env`. This ingress
receives no Google billing private key.
Use [shared forwarding](../../docs/DEVELOPMENT.md#receive-provider-webhooks-together)
to expose the Apple/Google webhook paths; keep database and queue private.
Pub/Sub must use the normal wrapped message format, not payload unwrapping.

`GET /health` reports process liveness and configuration enablement. It does not
check Google credentials, the tunnel, Pub/Sub, queue delivery, or purchases.

`src/local.ts` selects ElasticMQ; `src/lambda.ts` adapts API Gateway HTTP API
events to the same Hono app and an AWS SQS queue. Initialization failures return
a safe 503. In AWS this Lambda may only send to the queue; it has no database or
secret access. Google processing is disabled by default.
[AWS setup](../../docs/GOOGLE_PLAY.md#aws-notification-processing).
