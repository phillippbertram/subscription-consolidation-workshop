# Google Play notification ingress

Local Hono service on `127.0.0.1:3004`, started separately with
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

Copy `.env.example` to `.env` if absent; set the shared Google product settings
and push identity values there. This ingress needs no Google billing private key.
Expose only this service through an HTTPS tunnel; keep database and queue private.
Pub/Sub must use the normal wrapped message format, not payload unwrapping.

`GET /health` reports process liveness and configuration enablement. It does not
check Google credentials, the tunnel, Pub/Sub, queue delivery, or purchases.

`src/local.ts` selects ElasticMQ; `src/lambda.ts` adapts API Gateway HTTP API events
to the same Hono app and selects an AWS HTTPS SQS queue. Initialization failures
return a safe 503. CDK adds the Google POST route and queue-send permission; this
Lambda has no database or Secrets Manager permission. Google processing is
disabled by default. [AWS setup](../../docs/GOOGLE_PLAY.md#aws-notification-processing)
and [P12 evidence](../../docs/TASKS.md#p12-google-play-test-purchases) distinguish
prepared wiring from real delivery/purchase verification.
