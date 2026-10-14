# Stripe webhook

Verifies Stripe signatures against unchanged bytes and enqueues minimal references
before acknowledging supported events. It grants no access and has no database
or Auth0 dependency. [Payment processing](../../docs/PAYMENTS.md#processing-and-retries).

| Entry                             | Responsibility                                 |
| --------------------------------- | ---------------------------------------------- |
| `src/app.ts`                      | Signature verification and queue handoff       |
| `src/config.ts`, `src/runtime.ts` | Queue/signing configuration and composition    |
| `src/local.ts`, `src/lambda.ts`   | Loopback port 3002 / Gateway handler           |
| `scripts/stripe-listen.ts`        | CLI forwarding with the shared event allowlist |

Local setup needs only queue URL and signing secret, using the
[configuration map](../../docs/GETTING_STARTED.md#5-connect-the-configuration).
`pnpm dev:webhook` starts individually; grouped `pnpm dev` includes it.
The [Stripe listener](../../docs/PAYMENTS.md#stripe-test-setup) runs separately.

Lambda reads the signing field of the referenced Stripe Secrets Manager secret
with a five-minute cache. That existing secret also contains worker credentials;
service separation does not split its secret permissions. See
[cloud registration](../../docs/PAYMENTS.md#register-the-cloud-webhook).
