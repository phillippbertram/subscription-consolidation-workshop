# Sign-in and tokens

See how the API decides _who_ is calling and _what_ they may call,
and why a valid token still does not mean Premium.

## Steps

1. Start `pnpm dev` and sign in at `http://localhost:5173`. Note the internal
   user ID shown in the account details.

2. Call the API without a token:

   ```sh
   curl -i http://127.0.0.1:3000/health
   curl -i http://127.0.0.1:3000/v1/me
   ```

   **Expect:** `200` for health, `401` with `WWW-Authenticate: Bearer …` for `/v1/me`.

3. Borrow your own access token from the browser: open the developer tools,
   **Network** tab, click a request to `127.0.0.1:3000/v1/…`, and copy the
   value after `Bearer ` in the `Authorization` request header. Keep it in your
   shell only:

   ```sh
   ACCESS_TOKEN='paste-the-token-here'
   ```

4. Look inside the token locally (never paste tokens into websites):

   ```sh
   node -e 'const p = process.argv[1].split(".")[1]; console.log(JSON.parse(Buffer.from(p, "base64url")))' "$ACCESS_TOKEN"
   ```

   **Expect:** `iss` (your Auth0 tenant), `aud` (the API identifier), `sub`,
   `exp`, and `scope` with entries such as `read:me` and `read:premium`.

5. Use the token:

   ```sh
   curl -s -H "Authorization: Bearer $ACCESS_TOKEN" http://127.0.0.1:3000/v1/me
   curl -s -H "Authorization: Bearer $ACCESS_TOKEN" http://127.0.0.1:3000/v1/me/entitlements
   curl -i -H "Authorization: Bearer $ACCESS_TOKEN" http://127.0.0.1:3000/v1/premium/score-history
   ```

   **Expect:** your user ID; `"tier":"free"`; and `403` with
   `premium_required` (or `insufficient_scope` if your role lacks `read:premium`).

6. Break the signature by cutting off the last characters:

   ```sh
   curl -i -H "Authorization: Bearer ${ACCESS_TOKEN%?????}" http://127.0.0.1:3000/v1/me
   unset ACCESS_TOKEN
   ```

   **Expect:** `401`. The payload is unchanged, but the signature no longer matches.

## Where in the code

| File                                                                             | What to look for                                                       |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| [`services/api/src/auth.ts`](../../services/api/src/auth.ts)                     | `authenticate`: read token → verify with Auth0's keys → build identity |
| [`services/api/src/app.ts`](../../services/api/src/app.ts)                       | Authentication runs before every route except `/health`                |
| [`services/api/src/routes/premium.ts`](../../services/api/src/routes/premium.ts) | Scope check first, then the entitlement check                          |

## Why it works this way

<details>
<summary>Step 4 decoded the token without any key. Why must the API not do the same?</summary>

Anyone can create a token with any payload. Only the signature, checked with
Auth0's public keys (JWKS), proves that Auth0 issued it. The API trusts claims
only after signature, issuer, audience, and expiry checks.

</details>

<details>
<summary>Why are there two different 403 codes?</summary>

`insufficient_scope` means the token does not allow calling this route at all.
`premium_required` means the call is allowed, but the user has no valid
Premium grant right now. A scope is permission to ask, not proof of payment.

</details>

<details>
<summary>The API never accepts a user ID from the request. Why?</summary>

A client could send someone else's ID. The API maps the verified `iss` and
`sub` to the internal user ID itself, so a caller can only ever reach their own data.

</details>
