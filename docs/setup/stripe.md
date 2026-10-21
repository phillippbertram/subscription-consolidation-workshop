# Stripe

Create the test product, connect the local webhook listener, and make the first
test purchase. **Afterwards:** a Stripe test payment on the website grants
Premium after backend verification. Requires [Workspace](workspace.md) and
[Auth0](auth0.md). How payments and the access rules work:
[Payments](../PAYMENTS.md).

## 1. Create the product, keys, and listener

1. In your Stripe Dashboard, select a **sandbox/test environment**. Under
   **Product catalog → Add product**, create **PremiumPass Premium** with
   two recurring prices: **EUR 4.99/month** with lookup key `premium_monthly`
   and **EUR 1.00/day** with lookup key `premium_daily`. Both use flat-rate,
   licensed billing (not metered), quantity one, and no trial. Set each
   **Lookup key** in its price details/edit options. Daily means an automatically
   renewing subscription, not a one-time day pass. Copy the product's `prod_...` ID from
   the product details. The API will resolve the concrete `price_...` ID.
   [Product/price setup](https://docs.stripe.com/products-prices/manage-prices).
2. In that same environment, open **API keys** and reveal the test secret key
   (`sk_test_...`). The current backend accepts this key type; a publishable
   `pk_test_...` or restricted `rk_test_...` key will not work. No Stripe key is
   needed in Web. Copy the secret and product ID into API and worker, and the
   two lookup keys into API only, in
   [step 2](#2-enter-the-values).
   [Find API keys](https://docs.stripe.com/keys).
3. Install the [Stripe CLI](https://docs.stripe.com/stripe-cli), then run:

   ```sh
   stripe login
   pnpm stripe:listen
   ```

4. Confirm the CLI login selected the same account and test environment. Put its
   `whsec_...` secret in `config/.env` as `STRIPE_WEBHOOK_SECRET`; only the Stripe webhook receives it. Leave the listener
   running. It forwards the supported events to port 3002. Never use `--live`.
5. Continue with [step 2](#2-enter-the-values). Restart the webhook after
   changing its secret.

No Dashboard endpoint is needed locally. The webhook needs the signing secret
and queue; the worker needs the API key, product ID, database, and queue. Secret
values must never use `VITE_` or `EXPO_PUBLIC_` variables.
Do not create a customer or subscription manually in Stripe: start checkout from
the website so the backend creates the ownership mappings.

**Check:** API and worker use the same Stripe test environment and product.
The listener secret belongs to the local CLI, not a Dashboard webhook endpoint.

## 2. Enter the values

Replace the placeholders in `config/.env`. The sync sends Stripe keys and
signing secrets only to the backend programs listed in
[config/targets.mjs](../../config/targets.mjs). Remove the leading `#` from
`STRIPE_SECRET_KEY`, `STRIPE_PRODUCT_ID`, `STRIPE_MONTHLY_PRICE_LOOKUP_KEY`, and
`STRIPE_DAILY_PRICE_LOOKUP_KEY`; commented lines leave checkout disabled.

| Value / source                                          | Setting in `config/.env`          | Programs that receive it |
| ------------------------------------------------------- | --------------------------------- | ------------------------ |
| Stripe test secret key                                  | `STRIPE_SECRET_KEY`               | API, worker, CLI         |
| Stripe product ID (`prod_...`) from the product details | `STRIPE_PRODUCT_ID`               | API, worker, CLI         |
| Monthly lookup key (`premium_monthly`)                  | `STRIPE_MONTHLY_PRICE_LOOKUP_KEY` | API only                 |
| Daily lookup key (`premium_daily`)                      | `STRIPE_DAILY_PRICE_LOOKUP_KEY`   | API only                 |
| Signing secret printed by the running listener          | `STRIPE_WEBHOOK_SECRET`           | Stripe webhook only      |

The subscription CLI receives the same Stripe key and product ID and needs no
lookup key ([provider configuration](../../apps/cli/README.md#configuration)).

**Check:** `pnpm config:sync` writes every file, and `pnpm config:check` then
reports that the configuration is valid and every generated file is current.
Both name settings and files, never values.

## 3. Start and make a test purchase

With Docker running and the Stripe listener in its own terminal:

```sh
pnpm dev
```

This initializes the local table and starts API, both webhook processes,
worker, website, and reconciliation watcher. Reconciliation runs immediately
and every five minutes using the CLI's provider settings. The Apple process
remains disabled for purchase handling.
Keep this terminal running; use a third terminal for the `curl` checks below.
Stop older individual processes first to avoid port conflicts. If startup exits,
fix the first failing process in the output; the grouped command stops its peers.

| Check                                                                                     | Expected result                                                                                                              |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `curl -i http://127.0.0.1:3000/health`                                                    | `200`, `{"status":"ok"}`; checks the HTTP process only                                                                       |
| `curl -i http://127.0.0.1:3000/v1/me`                                                     | `401` without a token                                                                                                        |
| Open `http://localhost:5173` and sign in                                                  | Account with an internal user ID and Free access                                                                             |
| Refresh the page                                                                          | Same internal user ID                                                                                                        |
| Start checkout with card `4242 4242 4242 4242`, any future expiry and any three-digit CVC | Test payment completes and returns to the website; use no real card ([Stripe test details](https://docs.stripe.com/testing)) |
| Wait for worker processing, then **Refresh account**                                      | Premium and a current Stripe subscription                                                                                    |

Stay on `localhost:5173` for the website; `127.0.0.1:5173` is a different browser
origin. If Vite selects another port, free port 5173 and restart. A checkout
redirect alone does not activate access. If Premium does not appear, follow
[payment diagnosis](../PAYMENTS.md#manual-checks).

| First-run problem                        | Fix                                                                                                                             |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `checkout_unavailable`                   | Set and uncomment all four Stripe values in the API `.env`, then restart                                                        |
| `stripe_price_invalid` / price not found | Check lookup key, active price/product and the selected daily/monthly interval, configured `prod_` ID, and matching environment |
| `verified_email_required`                | Complete [Auth0 email verification](auth0.md#web-and-api-setup), then sign out/in                                               |
| No events in the listener after payment  | Check its account/environment; keep it running before starting checkout                                                         |

**Next:** read [Concepts](../CONCEPTS.md), then test the running system with
[Try it out](../try-it/README.md).

## Update an existing local setup

Keep the existing Stripe product, customers, subscriptions, and local records.
Replace `STRIPE_PRICE_ID` with `STRIPE_PRODUCT_ID` in API, worker, and CLI
configuration. In the API, replace the earlier single `STRIPE_PRICE_LOOKUP_KEY`
with `STRIPE_MONTHLY_PRICE_LOOKUP_KEY=premium_monthly` and add
`STRIPE_DAILY_PRICE_LOOKUP_KEY=premium_daily`. Assign each key to its matching
price on the same product. All processes must use the
same Stripe environment and product. Restart the API, worker, and reconciliation
watcher together after updating their configuration. No database reset or record
migration is needed; old purchase fingerprints remain valid. Stored attempts
without a `planId` are read as monthly because they predate daily billing.

The old environment variable is not a fallback. Leaving all API Stripe settings
unset disables checkout; partially configured settings fail with a setup error.
For a separately authorized AWS rollout, update the existing secret from
`priceId` to `productId` and coordinate worker/discovery configuration. The
existing secret cache can take five minutes to refresh. CDK synthesis does not
modify the secret or deploy anything, and cloud checkout remains outside scope.

## Register the cloud webhook

The AWS stack processes Stripe notifications but does not start checkout (see
[what runs where](../ARCHITECTURE.md#what-runs-where)). Cloud notifications need
matching owners in the AWS table; local records are not copied to AWS.

1. In the intended AWS account/region, create a Secrets Manager JSON secret with
   `secretKey`, `productId`, `webhookSecret`, using the default encryption key.
   Until an endpoint exists, use `PENDING_ENDPOINT_REGISTRATION` as the signing
   secret; keep purchases stopped until it is replaced.
2. Set `STRIPE_SECRET_ARN` in `config/.env`, follow [deployment](aws.md#deploy),
   and copy the exact `StripeWebhookUrl` output.
3. In Stripe Workbench → Webhooks, add a **Your account / Snapshot** destination
   for that URL, using API version `2026-09-30.endive` (the installed Stripe SDK baseline).
   Subscribe to `checkout.session.completed`, `customer.subscription.created`,
   `customer.subscription.updated`, `customer.subscription.deleted`,
   `invoice.paid`, and `invoice.payment_failed`.
4. Replace `webhookSecret` with that destination's secret. It differs from the
   CLI secret; runtime caches can take five minutes to refresh.
5. Verify delivery, worker completion, and owned subscription/access records
   separately.

## Cleanup

To pause, stop the CLI listener. To retire the integration, first cancel only
project-specific test subscriptions in Web or the Stripe test Dashboard and
allow their changes to process. Remove the project's webhook destination when
no longer needed; archive its product/price if retiring future test purchases.
Do not reset an entire shared test environment or rotate shared keys.
[Stripe cancellation](https://docs.stripe.com/billing/subscriptions/cancel).

Deleting local data does not cancel Stripe subscriptions. Continue with the
[overall cleanup sequence](../DEVELOPMENT.md#cleanup).
