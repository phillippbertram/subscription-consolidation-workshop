# Apple webhook

Local App Store Server Notifications V2 ingress on port 3003. It validates Apple-signed sandbox data, queues minimal synchronization jobs, and acknowledges only after queue acceptance. It uses public Apple root certificates and requires no private signing key or database credentials.

Configure the existing ignored `.env` using [Apple sandbox setup](../../docs/APPLE_PURCHASES.md), then run `pnpm dev:apple-webhook` from the root, or use the grouped `pnpm dev`. `GET /health` reports whether Apple verification is enabled. Forward `POST /v1/webhooks/apple` through an HTTPS tunnel. This service has no AWS deployment wiring yet.
