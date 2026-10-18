# Billing contracts

`@premiumpass/billing-contracts` owns the Stripe event allowlist, strict Stripe/Apple
queue job schemas, separate internal Stripe/Apple reconciliation jobs, local-only Google
test-purchase and mock/expiration jobs, and inferred types. Ingress, CLI forwarding, API store sync,
and worker use these contracts from `src/index.ts`.

Apple reconciliation is local-only. Its strict schema uses a run/lineage event ID
and keeps purchase/notification ingress restricted to the existing UUID jobs.
Google jobs bind the configured package and test environment; client/internal
jobs require a user UUID, while RTDN ownership is resolved by the worker from
Google. Tokens are private queue references and must never be logged.

It depends only on Zod and exports TypeScript source. No credentials, SDK clients,
provider adapters, or persistence belong here. [Processing flow](../../docs/PAYMENTS.md#processing-and-retries).
