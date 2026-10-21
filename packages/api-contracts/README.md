# HTTP API contracts

`@premiumpass/api-contracts` owns shared Zod request/response schemas and inferred
types for the API, Web, and Mobile. `src/index.ts` covers profile, scores, errors,
subscriptions/entitlements, Stripe actions, and Apple/Google synchronization.
`src/admin.ts` (`@premiumpass/api-contracts/admin`) covers the local-only admin
routes used by the [admin console](../../apps/admin/README.md).

Clients parse responses; API routes reuse strict billing inputs and check response
types with `satisfies`. Unknown product/status strings remain representable;
backend domain rules decide access. Transport/session handling stays in clients.

This package depends only on Zod and exports TypeScript source for the existing
bundlers. Database/domain schemas and [queue contracts](../billing-contracts/README.md)
remain separate. [Consumer checks](../../docs/DEVELOPMENT.md#run-and-check).
