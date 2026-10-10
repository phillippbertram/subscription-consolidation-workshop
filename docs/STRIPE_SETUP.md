# Local Stripe checkout

P06 step 1 connects the React website to hosted Stripe Checkout through the local BFF. It creates durable customer and purchase-attempt mappings. Webhook processing and Premium activation belong to step 2. A success redirect never grants access.

See the [Stripe flow diagrams](STRIPE_FLOW.md) for checkout, DynamoDB relationships, subscription processing, and entitlement evaluation.

## 1. Configure Stripe yourself

Use a dedicated Stripe sandbox or test mode and synthetic customer details only. In that environment:

1. Create an active product named **PremiumPass Premium**.
2. Add a recurring, flat-rate monthly price: **EUR 4.99**, quantity one, licensed usage. Do not use a trial, metered billing, or tiered pricing.
3. Copy the `price_...` ID and the environment's `sk_test_...` secret key. Product, price, key, and customers must belong to the same test environment.
4. Add these values to your existing ignored `services/bff/.env`, preserving its Auth0 and DynamoDB configuration:

```dotenv
WEB_ORIGIN=http://localhost:5173
STRIPE_SECRET_KEY=sk_test_REPLACE
STRIPE_PRICE_ID=price_REPLACE
```

Replace the placeholders locally. Never place the secret in a `VITE_` variable: Vite exposes those variables to the browser. No publishable key or Stripe.js is needed; the server returns a hosted URL. No webhook secret is needed yet. The adapter uses the pinned `stripe` SDK 23.0.0 and its default API version `2026-09-30.endive`.

Leave both Stripe variables unset to keep checkout disabled while using the rest of the BFF. Partial or non-test configuration fails startup. The server verifies that the configured price and retrieved customer/session are test objects.

## 2. Configure Auth0 and the website

Create a separate **Single Page Application**, `PremiumPass Web`, in the existing tenant. Use the mobile app's domain, API audience, connection, and demo user. Set these three application fields to exactly `http://localhost:5173`:

- Allowed Callback URLs
- Allowed Logout URLs
- Allowed Web Origins

Allow the Custom API scopes `read:me` and `write:checkout` for this SPA and demo user. If RBAC is enabled, assign the permissions through the user's role and check application access as described in the [Auth0 guide](AUTH0_SETUP.md#3-configure-user-permissions-and-application-access). Sign out/in after scope changes. The client requests `openid profile email read:me write:checkout` using Authorization Code with PKCE; the SDK persists its token cache in local storage so valid sessions survive reloads and checkout redirects. No client secret or refresh token is configured. After token expiry, browser privacy settings can prevent silent renewal; sign in again when needed.

Copy `apps/web/.env.example` to `apps/web/.env` once, then enter the public SPA client ID, domain, audience, and local API origin. Preserve an existing file. See [web setup](../apps/web/README.md).

## 3. Start locally

From the repository root, with the pinned Node/pnpm versions:

```sh
pnpm install --frozen-lockfile
pnpm db:up
pnpm dev
```

In another terminal:

```sh
pnpm web:dev
```

Open **http://localhost:5173**. Restart each server after changing its environment. Use `localhost` consistently for the website, even though its API calls use `http://127.0.0.1:3000`. Hono handles CORS/preflight for this exact web origin. It still verifies every protected request's token and scope.

Sign in, compare the internal user ID with the mobile app, then choose **Continue to test checkout**. On Stripe, use `4242 4242 4242 4242`, a future expiry, and any three-digit CVC with synthetic details. Verify the displayed product and amount before submitting. On return, the website explicitly states that Premium is not activated. Confirm the test customer/session in Stripe and the mappings in [DynamoDB Admin](http://127.0.0.1:8001).

## Endpoint and ownership

`POST /v1/billing/stripe/checkout-session` requires an Auth0 user token with `write:checkout`, `openid`, and `email`, JSON content type, and a UUID `Idempotency-Key`. Its strict request body is:

```json
{"planId":"premium_monthly"}
```

The response contains `sessionId`, `url`, and an ISO `expiresAt`. User ID, customer ID, price, quantity, and return URLs are derived by the server. Client-supplied ownership fields are rejected. The customer is linked through the verified issuer/subject and internal user ID, never email. A reverse ownership record and Stripe customer metadata are checked before reuse. Session and subscription metadata carry the server's user/request references.

## Verified email prefill

After JWT, scope, origin, and input validation, the BFF calls the configured issuer's `/userinfo` endpoint with the same access token. It requires the returned `sub` to match the validated token and accepts only a syntactically valid email with `email_verified: true`. The browser does not send an email field or ID token; extra checkout fields remain rejected. No Auth0 Action, Management API credential, or client secret is needed. The SPA already requests `openid profile email`.

Before creating or resuming Checkout, the BFF checks both stored customer ownership and Stripe metadata, then sets the Stripe customer's email to the verified Auth0 address when different. This also fills existing customers that have no email and replaces an older Stripe email if Auth0 now reports a different verified address. Customer creation retains its original idempotent parameters; the email is assigned separately so retries of older creation requests remain compatible. An interrupted email update can be repeated on the same customer.

Stripe uses the customer's email in hosted Checkout and makes it non-editable there. Email is contact data only: the internal user ID still determines purchase ownership. The email is not persisted in DynamoDB, returned by the checkout API, or written to HTTP logs.

For a database-connection user, complete Auth0's email-verification flow before checkout. Social connections must provide a verified email through Auth0. If verification or the email is missing, checkout returns `403 verified_email_required` before any Stripe operation. Sign in again after verification or scope changes. A mismatching UserInfo subject returns `403 auth0_profile_identity_mismatch`; Auth0 rejecting the token returns `401`; network errors, rate limits, and invalid profile responses return `503 auth0_profile_unavailable`. An Auth0 outage never falls back to browser-supplied or unverified email.

Manual check: use a verified synthetic Auth0 account, open checkout, and confirm that the expected email is shown. Repeat with an existing customer lacking an email; the same `cus_` ID should be updated. An unverified account must show the verification message without creating a Stripe customer/session. Retry an open checkout using the original attempt; it must retain its customer and session.

Sources: [Auth0 UserInfo](https://auth0.com/docs/api/authentication/user-profile/get-user-info), [Stripe customer updates](https://docs.stripe.com/api/customers/update), [Checkout customer email behavior](https://docs.stripe.com/api/checkout/sessions/create#checkout_session_create-customer).

## Retries and recovery

The browser retains only a user-scoped attempt UUID in session storage. Retry in the same tab to reuse it; changing checkout settings for that UUID returns `409 idempotency_conflict`. Separate attempts are serialized through a conditional active-attempt record. Existing subscriptions other than `canceled` or `incomplete_expired` block another purchase.

Sessions have a fixed one-hour expiry. Returning through Cancel keeps the session open; retry resumes it. Only Stripe-confirmed expiration allows a replacement attempt. A completed session stays blocked in this step, even after a later cancellation; lifecycle processing/recovery follows in step 2. Avoid deleting mappings to work around this protection.

A crash before saving a Stripe response is recovered with the same persisted parameters and provider idempotency key. Customer creation stops automatic retries after 23 hours, before Stripe's minimum 24-hour retention can lapse. Session creation with a missing stored session ID stops after 20 minutes, keeping its fixed expiry within Stripe's minimum creation window. These conservative guards return `customer_recovery_required` or `checkout_recovery_required`. Inspect the stored request and Stripe's objects/request history, verify ownership, and recover the original reference before resuming. There is no automated repair command yet; never blindly reset the lock or create another customer.

`401` indicates invalid authentication; `403` covers missing scopes, machine identities, or an unexpected browser origin. `400` covers invalid input; `409` covers conflicts/recovery; `503` covers missing configuration, invalid price, or unavailable Stripe. Temporary DynamoDB failures may return `500`; retry the same attempt. Billing HTTP logs contain metadata only, even at debug level, because checkout URLs and payment payloads must not enter logs.

## Boundary and manual checks

The local entry point enables checkout. Lambda/CDK do not yet supply a Stripe secret, billing write permissions, or web CORS configuration. Do not deploy this step expecting cloud checkout. No AWS or Stripe resources are created by setup scripts.

After entering your own values, manually verify login, stable customer mapping, same-key retries, competing tabs, cancellation/resume, expiration/new attempt, and a real Stripe test purchase. A second synthetic account must get a different customer. The mobile entitlement remains unchanged until signed webhooks and the worker exist. Never treat local fake-provider checks as evidence of a real Stripe purchase. Verification evidence is recorded only in [P06](TASKS.md#p06-stripe-purchase-and-reliable-processing).

Sources: [Stripe testing](https://docs.stripe.com/testing), [Checkout creation](https://docs.stripe.com/api/checkout/sessions/create), [Stripe idempotency](https://docs.stripe.com/api/idempotent_requests), [Auth0 React quickstart](https://auth0.com/docs/quickstart/spa/react).
