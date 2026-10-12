# Billing contracts

`@premiumpass/billing-contracts` exports the supported Stripe `eventTypes`, strict queue `jobSchema` and inferred `StripeJob` type. Webhook ingestion, CLI forwarding and the subscription worker share this contract.

This package depends only on Zod. It contains no service initialization, credentials, provider adapters or persistence. TypeScript source is consumed directly during development and bundled into each service's build; it is not a runnable service.

See [Payments](../../docs/PAYMENTS.md#processing-and-retries) for processing behavior.
