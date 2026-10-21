# Auth0

Auth0 identifies the user; PremiumPass verifies the access token and checks
subscription access separately. Use one development tenant and the same user
connection for Web and Mobile. **Afterwards:** two synthetic users with verified
email addresses can sign in. Requires the [Workspace](workspace.md).

## Web and API setup

1. **Select or create your development tenant** in the [Auth0 Dashboard](https://manage.auth0.com/).
   Create dedicated PremiumPass resources; leave unrelated tenant settings alone.
2. **Create a Custom API** under Applications → APIs:

   | Setting                 | Value                                                       |
   | ----------------------- | ----------------------------------------------------------- |
   | Name                    | `PremiumPass API`                                           |
   | Identifier / audience   | `https://api.premiumpass.example` or your chosen identifier |
   | Signing algorithm       | `RS256`                                                     |
   | JWT profile, if offered | `Auth0`; no access-token encryption                         |

   The identifier is not a network address and need not resolve. Keep it exact
   across API and clients. [API registration](https://auth0.com/docs/get-started/auth0-overview/set-up-apis).

3. **Add API permissions:** `read:me` for profile/subscriptions,
   `read:premium` for protected scores, and `write:checkout` for billing actions.
   `openid profile email` are login scopes, not Custom API permissions.
4. **Enable RBAC** for this API. Leave **Add Permissions in the Access Token**
   off: this backend reads the verified `scope` claim. Under **User Management →
   Roles**, create `premiumpass-user`; in its **Permissions** tab, add all three
   permissions from PremiumPass API. Both Free and Premium
   users get this role; subscription access stays in the backend.
   [RBAC setup](https://auth0.com/docs/get-started/apis/enable-role-based-access-control-for-apis).
5. **Create `PremiumPass Web` as a Single Page Application.** Set these allowlists:

   | Setting               | Value                   |
   | --------------------- | ----------------------- |
   | Allowed Callback URLs | `http://localhost:5173` |
   | Allowed Logout URLs   | `http://localhost:5173` |
   | Allowed Web Origins   | `http://localhost:5173` |

6. **Enable its user connection.** Use an existing development database
   connection, or create one under Authentication → Database. Enable it for
   PremiumPass Web. Create two synthetic users under User Management → Users in
   that database connection. Use fictional names and two mailbox addresses/aliases
   you control. In each user's **Roles** tab, assign `premiumpass-user`.
   Open Auth0's verification email and follow its link; if needed, use the user's
   **Actions → Send Verification Email**. Check spam and confirm the user profile
   shows a verified email. Addresses ending in `.example` cannot receive this mail.
   [Email verification](https://auth0.com/docs/manage-users/user-accounts/resend-verification-emails).
7. **Authorize the client** as described below. Copy Domain and Client ID from
   the SPA settings, and the identifier from the Custom API. Enter them as described in
   [Enter the values](#enter-the-values).

The issuer is `https://<domain>/`; client domain values contain only the
hostname. With a custom domain, use it consistently. No Auth0 client secret or
Management API token belongs in either app or the API's runtime configuration.
When testing, use the database email/password login for these users. Choosing a
social login creates a different identity with its own role assignment and data.

## Enter the values

Set these in `config/.env`:

| Value / source                                | Setting in `config/.env` | Programs that receive it                                  |
| --------------------------------------------- | ------------------------ | --------------------------------------------------------- |
| Auth0 domain, e.g. `your-tenant.eu.auth0.com` | `AUTH0_DOMAIN`           | Web and Mobile; API and AWS as issuer `https://<domain>/` |
| Custom API identifier                         | `AUTH0_AUDIENCE`         | API, Web, Mobile, AWS                                     |
| SPA Client ID                                 | `WEB_AUTH0_CLIENT_ID`    | Web                                                       |

**Check:** you have the tenant domain, Custom API identifier, SPA Client ID,
and a synthetic user whose email is verified. Client ID and API audience are
different values; neither is a client secret. Sign-in is tested once
[Stripe](stripe.md#3-start-and-make-a-test-purchase) starts everything.

**Next:** [Stripe](stripe.md).

## Application access policy

For the dedicated API, select **Per-app authorization** for **User-Delegated
Access**. Under Application Access, authorize PremiumPass Web and, when created,
PremiumPass Mobile for `read:me`, `read:premium`, and `write:checkout`.

Permissions must be requested by the client, allowed for that application, and
assigned to the user when RBAC is enabled. **Client Access** concerns machine
credentials and does not enable user login. A shared API with an all-apps policy
may not require individual grants; do not change its policy for this demo.
[Auth0 application access policies](https://auth0.com/blog/developers-guide-api-access-policies-auth0/).

## Add the Native application

1. Create **PremiumPass Mobile**, type **Native**, in the same tenant.
2. Enable the same user connection and user-delegated API permissions.
3. Choose your iOS bundle identifier and set `IOS_BUNDLE_IDENTIFIER` in the
   mobile configuration before building. Register this URL in both **Allowed
   Callback URLs** and **Allowed Logout URLs**, replacing the domain and bundle
   identifier (lowercase in the callback path):

   ```text
   premiumpass://your-tenant.eu.auth0.com/ios/com.example.premiumpass/callback
   ```

   For Android, set `ANDROID_PACKAGE_NAME` before prebuild and add the matching
   URL to both lists as well, preserving the existing iOS entries:

   ```text
   premiumpass://your-tenant.eu.auth0.com/android/com.yourcompany.premiumpass/callback
   ```

   Replace the package placeholder with the exact installed package in lowercase.
   The app uses the same Native application, PKCE flow, and SDK-owned secure
   credentials on both platforms. No mobile client secret is needed.

4. Copy the Native Client ID and domain into the [mobile configuration](apple.md#configure-the-app).
   Keep the API audience unchanged. Preserve callbacks for other installed demo builds.

The app uses PKCE and requests `openid profile email read:me read:premium
write:checkout`. Sign out/in after permission changes. Native domain, scheme,
or bundle changes require a rebuild; Expo Go cannot run this app.
[Auth0 Expo quickstart](https://auth0.com/docs/quickstart/native/react-native-expo).

## Manual verification

| Scenario                                                             | Expected result                                       |
| -------------------------------------------------------------------- | ----------------------------------------------------- |
| T01: user access token with `read:me` → `/v1/me`                     | `200`, stable `userId` and `createdAt`                |
| T02: missing/expired/tampered token, wrong issuer/audience/algorithm | `401`; no protected handler runs                      |
| T03: valid token without required scope                              | `403`                                                 |
| T05: user B submits user A's identifiers                             | No access or ownership transfer                       |
| Machine token calls a user route                                     | `403 user_identity_required`; no user profile created |

Repeat login/profile loading for both synthetic users. The same verified
issuer/subject must retain its ID; different identities must get different IDs.
Email equality does not link accounts. For backend-only requests, optionally
use the [Auth0 CLI user token flow](https://auth0.github.io/auth0-cli/auth0_test_token.html)
and keep the access token only in your shell:

```sh
curl -i -H "Authorization: Bearer $ACCESS_TOKEN" http://127.0.0.1:3000/v1/me
unset ACCESS_TOKEN
```

For isolated authentication verification, also exercise missing `exp`, unknown
`kid`, key rotation, cache reuse, and JWKS outage with controlled keys. No test
verifier is a runtime fallback. See [API authentication](../../services/api/README.md#authentication).

## Troubleshooting

| Symptom                        | Check                                                                                     |
| ------------------------------ | ----------------------------------------------------------------------------------------- |
| Startup refuses Auth0 settings | Issuer is an HTTPS origin with trailing `/`; audience is the Custom API identifier        |
| Callback mismatch              | Configured application's domain, scheme, bundle identifier, and allowlists                |
| Login or token request denied  | Connection, user role, requested scopes, and application access grant                     |
| API `401`                      | Use an access token, not an ID or Management API token; verify issuer/audience and expiry |
| API `403`                      | Required scopes and fresh login; Premium also needs a valid entitlement                   |
| `verified_email_required`      | Complete the synthetic account's email verification and sign in again                     |
| API `503`                      | JWKS cannot be obtained; retry after the advertised interval                              |
| Browser CORS error             | API `WEB_ORIGIN` must match; Auth0 allowlists do not configure API CORS                   |

## Cleanup

Sign out of Web and Mobile first. In the intended tenant, remove only applications,
API, roles, and synthetic users created exclusively for this demo. Deleting users
or applications breaks their login; deleting Auth0 users does not remove their
DynamoDB records or cancel subscriptions. Preserve shared connections and tenants.
See [delete applications](https://auth0.com/docs/get-started/applications/remove-applications)
and [delete users](https://auth0.com/docs/manage-users/user-accounts/delete-users).
Finish the [overall cleanup sequence](../DEVELOPMENT.md#cleanup).
