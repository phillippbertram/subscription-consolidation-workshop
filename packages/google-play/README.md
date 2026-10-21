# Google Play adapter

Explicit test-purchase configuration, a fixed-endpoint Developer API client,
Google-authenticated Pub/Sub identity verification, and purchase-response
validation. No environment is read until the caller supplies it. Service-account
credentials are loaded only by the worker or an explicit reconciliation run;
there is no implicit application-default credential or mock fallback.
`createGoogleClient` reads the explicit local key file;
`createGoogleClientFromCredentials` accepts validated service-account data from
worker-owned Secrets Manager loading. Only the fixed JWT email/key/scope fields
are used; arbitrary credential JSON endpoints are not trusted.

The client reads `purchases.subscriptionsv2.get` and acknowledges the same token
through `purchases.subscriptions.acknowledge`. Verification requires `testPurchase`,
an internal UUID owner, the configured product/base plan, one auto-renewing line,
and an expiry for non-pending states. Linked replacement purchases and offers are
rejected: plan changes and token-lineage migration require a separate design.

Public subscription IDs hash the package-scoped token. Purchase tokens remain
private server/queue data. Provider exceptions are replaced by safe codes because
SDK errors can contain credentials and token-bearing request URLs.

[Setup](../../docs/setup/google.md) · [Worker](../../services/subscription-worker/README.md)

## Lightweight contracts

`@premiumpass/google-play/contracts` exports settings validation, subscription
identifiers, token/package schemas, and `GooglePlayError` without loading the
Google auth/HTTP SDK. Scheduled discovery uses this entry because it only reads
known references and enqueues work. The root export retains these same symbols
alongside provider clients and verification; existing callers remain compatible.
