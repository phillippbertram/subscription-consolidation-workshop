# Billing contracts

`@premiumpass/billing-contracts` owns the Stripe event allowlist, strict Stripe/Apple
queue job schemas, separate internal Stripe/Apple reconciliation jobs, local-only Google
mock/expiration jobs, and inferred types. Ingress, CLI forwarding, API Apple sync,
and worker use these contracts from `src/index.ts`.

Apple reconciliation is local-only. Its strict schema uses a run/lineage event ID
and keeps purchase/notification ingress restricted to the existing UUID jobs.

It depends only on Zod and exports TypeScript source. No credentials, SDK clients,
provider adapters, or persistence belong here. [Processing flow](../../docs/PAYMENTS.md#processing-and-retries).
