# Auth0 setup with an existing tenant

This guide prepares an existing Auth0 tenant for PremiumPass. It documents configuration to perform; it does not confirm that any tenant resources have been created. Backend behavior is described in the [README](../README.md#backend-authentication), and implementation status remains in [TASKS.md](TASKS.md).

## 1. Resources and timing

Select the intended development tenant in the Auth0 Dashboard. Create dedicated PremiumPass resources within it, or reuse compatible resources already created for this demo. Keep unrelated applications and tenant-wide defaults unchanged.

| Resource | Purpose | Needed when |
|---|---|---|
| Custom API: `PremiumPass API` | Audience, signing algorithm, and API permissions | Now, for real backend tokens |
| Native application: `PremiumPass Mobile` | React Native login with Universal Login and PKCE | P04 |
| SPA application: `PremiumPass Web` | Browser login for the separate Stripe test website | P06 |
| Existing user connection and two synthetic users | Shared identity across mobile and web | P04, then P06 |
| Optional M2M application: `PremiumPass API Smoke` | Manual token-verification check before a client exists | Optional in P02 |

The API represents the protected resource; applications represent clients requesting access. The BFF verifies tokens and needs neither a separate login application nor a client secret. API Gateway has no JWT or Lambda authorizer.

## 2. Register the Custom API

Open **Applications → APIs → Create API** and use:

| Field | Demo value |
|---|---|
| Name | `PremiumPass API` |
| Identifier | `https://api.premiumpass.example` |
| Signing Algorithm | `RS256` |
| JWT Profile, if offered | `Auth0` |

The identifier is the audience, not the backend's network address. It does not need to resolve. Choose it once: Auth0 does not allow changing an API identifier afterward. Copy it exactly, including any trailing slash. Use this Custom API, not the built-in Auth0 Management API. The current backend accepts signed RS256 JWTs; do not enable access-token encryption for this API. [Register APIs](https://auth0.com/docs/get-started/auth0-overview/set-up-apis).

In the API's **Permissions** tab, add:

| Permission | Description | Backend use |
|---|---|---|
| `read:me` | Read the current user's profile and subscription status | Required by the current `GET /v1/me` |
| `read:premium` | Request Premium demo content | Required by `GET /v1/premium/score-history`; also requires a valid entitlement |
| `write:checkout` | Start checkout for the current user | `POST /v1/billing/stripe/checkout-session` |

These are custom API scopes. `openid profile email` are OIDC scopes requested during login, not entries to add to this API's permissions list. [API permissions](https://auth0.com/docs/get-started/apis/add-api-permissions).

## 3. Configure user permissions and application access

### Suggested demo setup: RBAC with a basic user role

For the dedicated PremiumPass API, enable **Settings → RBAC Settings → Enable RBAC**. Leave **Add Permissions in the Access Token** off: the BFF reads the verified `scope` string, not the separate `permissions` array. With RBAC enabled, a user's token scopes are the intersection of requested scopes and assigned permissions. Merely defining a permission does not assign it to anyone. If reusing an API with RBAC disabled, understand that clients can request its defined permissions without user-role assignments. [Auth0 RBAC behavior](https://auth0.com/docs/get-started/apis/enable-role-based-access-control-for-apis).

Under **User Management → Roles**, create `premiumpass-user`. In its **Permissions** tab, add all three PremiumPass API permissions. Assign this role to both demo users through **User Management → Users → selected user → Roles**. This is a suggested setup for this guide, not a previously applied tenant configuration. [Create roles](https://auth0.com/docs/manage-users/access-control/configure-core-rbac/roles/create-roles) · [Assign roles](https://auth0.com/docs/manage-users/access-control/configure-core-rbac/rbac-users/assign-roles-to-users).

Both Free and Premium users receive the same basic role. `read:premium` permits a request; only the backend's entitlement check permits Premium content. Do not encode subscription status in an Auth0 role.

### Application access policy

Check **API Settings → Application Access Policy**. For the dedicated demo API, use **Per-app authorization** for **User-Delegated Access** and explicitly grant each client access after creating it. Under **Application Access → Edit → User-Delegated Access**, enable access and select:

| Application | Allowed API permissions |
|---|---|
| `PremiumPass Mobile` | `read:me`, `read:premium` |
| `PremiumPass Web` | `read:me`, `read:premium`, `write:checkout` |

Save each grant. An API allowing all applications may not need these individual grants, but RBAC and requested scopes still apply. **Client Access** is a separate policy for M2M tokens; it does not authorize interactive mobile or web login. Leave it disabled unless using the optional M2M check below. [Application access policies](https://auth0.com/docs/get-started/apis/api-access-policies-for-applications).

## 4. Configure the backend now

Copy [`.env.example`](../services/bff/.env.example) to `services/bff/.env` only if that file does not exist. Otherwise update the existing file:

```dotenv
PORT=3000
AUTH0_ISSUER=https://your-tenant.eu.auth0.com/
AUTH0_AUDIENCE=https://api.premiumpass.example
```

Use the domain through which clients actually authenticate. With an existing custom domain, use its issuer consistently in the BFF and clients; tokens issued through the tenant domain and custom domain have different issuer values. The issuer includes `https://` and a trailing `/`; the client SDK's domain value is only the hostname. [Auth0 custom domains](https://auth0.com/docs/customize/custom-domains/configure-features-to-use-custom-domains).

The backend derives `https://<domain>/.well-known/jwks.json` from that issuer. No client ID, client secret, Management API token, or callback URL belongs in the BFF configuration. Restart `pnpm dev` after changing `.env`.

## 5. Configure the Native application for P04

Under **Applications → Applications → Create Application**, choose **Native** and name it `PremiumPass Mobile`. Set its **Domain** and **Client ID** in `apps/mobile/.env` as described in the [mobile guide](../apps/mobile/README.md). Use Authorization Code with PKCE through the Auth0 SDK; no client secret is embedded in the app.

The mobile project uses these values in `apps/mobile/app.config.ts`:

| Mobile setting | Configured value |
|---|---|
| Explicit custom scheme | `premiumpass` |
| iOS bundle identifier | `com.example.premiumpass` |
| Android package name | `com.example.premiumpass` |

With those values, put both URLs below in **Allowed Callback URLs** and **Allowed Logout URLs**, replacing the domain:

```text
premiumpass://your-tenant.eu.auth0.com/ios/com.example.premiumpass/callback
premiumpass://your-tenant.eu.auth0.com/android/com.example.premiumpass/callback
```

Save the application settings. Match the Expo Auth0 plugin's `domain` and explicit `customScheme`, the platform identifiers, and the SDK login/logout options to these URLs. Rebuild the native development app after native configuration changes; Expo Go does not support this SDK. [Auth0 Expo quickstart](https://auth0.com/docs/quickstart/native/react-native-expo) · [React Native SDK](https://github.com/auth0/react-native-auth0).

The login request must explicitly use the Custom API audience and request `openid profile email read:me read:premium`. After adding `read:premium`, sign out and sign in again: existing credentials do not gain new scopes. Verify the API permission, user role, and application grant all allow it. Send the resulting **access token** to the BFF, not the ID token. The callback returns to the mobile app; `http://127.0.0.1:3000/v1/me` is an API endpoint, not a login callback.

## 6. Enable the user connection and prepare users

In each application's **Connections** tab, enable the intended existing database or social connection. For a simple demo, use one database connection for both clients. You can also manage application enablement from **Authentication → Database → selected connection → Applications**. [Connections](https://auth0.com/docs/authenticate/identity-providers/view-connections).

Create two synthetic accounts through **User Management → Users → Create User**, selecting that database connection, or reuse two existing demo accounts. Assign the basic role from section 3 to both. Check that existing tenant Actions do not block these clients or rewrite their scopes unexpectedly.

Use the same account and connection when moving from mobile to web. The backend identifies users by verified `iss` and `sub`; identical email addresses across different connections do not establish the same identity. No automatic account linking by email is planned.

## 7. Configure the SPA for P06

Create `PremiumPass Web` as a **Single Page Application**. It has its own Client ID but uses the same domain, API audience, connection, and demo accounts as mobile. For the Vite development origin of `http://localhost:5173`, configure:

| Application setting | Example |
|---|---|
| Allowed Callback URLs | `http://localhost:5173` |
| Allowed Logout URLs | `http://localhost:5173` |
| Allowed Web Origins | `http://localhost:5173` |

The React SDK uses Authorization Code with PKCE. The web app requests `openid profile email read:me write:checkout` and the Custom API audience. Do not ship a client secret to the browser. [SPA dashboard configuration](https://auth0.com/docs/quickstart/spa/react) · [SPA SDK](https://auth0.com/docs/libraries/auth0-single-page-app-sdk).

Checkout additionally requires a verified email on the Auth0 demo account. The backend obtains it from `/userinfo` with the already validated access token and compares the returned subject. The SPA already requests the required `openid` and `email` scopes; no custom claims or Management API credentials are needed. Complete the email verification flow and sign in again before checkout. See [verified email prefill](STRIPE_SETUP.md#verified-email-prefill).

Auth0's allowed origins do not configure BFF CORS. The local BFF implements CORS for `WEB_ORIGIN` (default `http://localhost:5173`). Follow the [Stripe/web setup](STRIPE_SETUP.md) to configure both apps. Stripe return URLs also have a separate purpose from Auth0 callbacks.

## 8. Obtain a token and check the backend manually

### Get a user token now with the Auth0 CLI

The CLI can perform browser login before the mobile or web application code exists. Register `PremiumPass Mobile` as a **Native** application, or use a compatible demo SPA registration. Enable its user connection and user-delegated API access with `read:me`; with RBAC enabled, assign that permission to the demo user as described in section 3. Use this application's Client ID, not an M2M client ID.

Install the CLI on macOS and connect it to the intended tenant:

```sh
brew install auth0
auth0 login
```

This authenticates the CLI to manage the tenant. The following command performs a separate application login as your demo user:

```sh
auth0 test token YOUR_APPLICATION_CLIENT_ID \
  --audience "https://api.premiumpass.example" \
  --scopes "openid,profile,email,read:me,read:premium"
```

Replace the audience with the exact `AUTH0_AUDIENCE` value. If the BFF uses a custom-domain issuer, add `--domain "login.example.com"` with that hostname. [CLI token command](https://auth0.github.io/auth0-cli/auth0_test_token.html).

Follow the CLI prompts and sign in through the browser with a synthetic demo user. The CLI may request permission to temporarily add its local callback URL to the application and remove it afterward. This callback belongs to the CLI's local login flow, not the BFF. [Auth0 CLI login walkthrough](https://developer.auth0.com/resources/labs/tools/auth0-cli-basics).

After the CLI confirms that it copied the access token to the clipboard, capture it in your macOS terminal:

```sh
ACCESS_TOKEN="$(pbpaste)"
```

Use the **access token**, not the ID token or the CLI's tenant-management token. Keep it out of project files and logs. Clipboard copying is implemented by the [official CLI](https://github.com/auth0/auth0-cli/blob/main/internal/cli/test.go).

The Native client in P04 obtains user tokens through its SDK; the SPA follows in P06. The CLI flow remains useful for independent backend requests.

### Machine tokens do not provide a user profile

The verifier can authenticate a valid M2M token, but `/v1/me` rejects it with `403 user_identity_required`, even with `read:me`. Its subject identifies an application, not a person; no profile is created. A dashboard Client Credentials example therefore cannot supply a successful user-profile request. No M2M application is needed for the CLI user-login flow above.

### Call the local backend

Start DynamoDB Local and the BFF with `pnpm dev`. In the terminal containing `ACCESS_TOKEN`, run:

```sh
curl -i http://127.0.0.1:3000/health
curl -i http://127.0.0.1:3000/v1/me
curl -i -H "Authorization: Bearer $ACCESS_TOKEN" http://127.0.0.1:3000/v1/me
unset ACCESS_TOKEN
```

With DynamoDB running and its table created, expect 200 for health, 401 without a token, and 200 with a valid user token containing `read:me`. The last response contains the persisted `userId` and `createdAt`. Follow the [local database setup](../infra/README.md#local-dynamodb-and-manual-requests) first. These are manual requests, not an automated test suite.

## 9. Optional refresh tokens

Refresh tokens are not required for P02. If adding persistent login later, enable **Allow Offline Access** for the API, enable the application's Refresh Token grant and rotation, and request `offline_access`. Configure expiration and use the SDK's supported credential storage. The BFF continues to receive access tokens, never refresh tokens. [Configure refresh token rotation](https://auth0.com/docs/secure/tokens/refresh-tokens/configure-refresh-token-rotation).

## 10. Troubleshooting and completion

| Symptom | Check |
|---|---|
| Server refuses to start | Both Auth0 variables exist; issuer is an HTTPS origin ending in `/` |
| Callback mismatch | Actual scheme, domain, platform identifier, and path match the allowlist and SDK |
| Login cannot use the connection | Connection enabled for this application; user belongs to that connection |
| Token request denied | Correct API audience and user-delegated/client access policy for this grant |
| BFF returns 401 | Access token rather than ID/Management API token; exact issuer/audience, RS256 signature, expiration |
| BFF returns 403 | Client requested `read:me`; app grant allows it; RBAC user has it; `scope` contains it |
| Role changes have no effect | Obtain a fresh access token; an already-issued JWT does not change |
| BFF returns 503 | Configured issuer's JWKS is reachable; retry after the advertised 30 seconds |
| Browser call fails despite a valid token | BFF CORS includes the actual SPA origin; Auth0 allowlists alone are insufficient |

After setup, record only non-secret configuration and the manual outcome:

- [ ] Dedicated API identifier, RS256, and permissions configured.
- [ ] Backend issuer and audience match the selected tenant/domain and API.
- [ ] Each implemented client has the correct type, redirects, connection, audience, and requested scopes.
- [ ] App access grants and user permissions allow the intended scopes.
- [ ] Two demo users can log in through implemented clients and retain distinct subjects.
- [ ] Manual BFF requests produce the expected responses; distinguish M2M checks from user login.

Dashboard guidance was checked against the linked official documentation on October 10, 2026. Complete only the steps needed for the current task; mobile and web login remain later implementation work.
