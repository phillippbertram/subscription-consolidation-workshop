# Billing contracts

`@premiumpass/billing-contracts` owns the Stripe event allowlist, strict Stripe/Apple
queue job schemas, and inferred types. Ingress, CLI forwarding, API Apple sync,
and worker use these contracts from `src/index.ts`.

It depends only on Zod and exports TypeScript source. No credentials, SDK clients,
provider adapters, or persistence belong here. [Processing flow](../../docs/PAYMENTS.md#processing-and-retries).
