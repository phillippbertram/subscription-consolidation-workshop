# Subscriptions and entitlements

P05 connects normalized subscription records, a pure access policy, DynamoDB reads, and the mobile dashboard. It makes no payment and does not implement provider synchronization. Implementation status is tracked only in [TASKS.md](TASKS.md#p05-subscription-and-entitlement-domain-rules).

## Read path

1. The backend verifies the Auth0 token and endpoint scope, then rejects machine identities.
2. The validated issuer/subject resolves the internal user. No client-supplied user ID selects data.
3. The persistence adapter queries that user's `SUB#` records with consistent reads, follows all pages, and validates fields and ownership with Zod.
4. `deriveEntitlements(subscriptions, now)` computes access. Time is injected by the app factory and sampled after the database read.
5. The Premium route requires both `read:premium` and the `score_history` entitlement. It never trusts the app's badge or cached response.

| Endpoint | Required scope | Response |
| --- | --- | --- |
| `GET /v1/me/subscriptions` | `read:me` | `{ subscriptions: [...] }`, including provider status, verified time, and source revision |
| `GET /v1/me/entitlements` | `read:me` | Tier, features, grants, next boundary, evaluation time, and unknown-mapping warnings |
| `GET /v1/premium/score-history` | `read:premium` plus active grant | Synthetic points; otherwise `403 premium_required` |

Missing scopes return `403 insufficient_scope`; absent/invalid tokens return 401. Database/schema failures return 500 without granting access. Every response uses `Cache-Control: no-store`. P05 has no synchronization job, so `verifiedAt` is the stored verification time, not proof of current provider reachability.

## Access policy

Only `premium_monthly` grants `score_history`. For Stripe, `incomplete` maps to `pending`, while `incomplete_expired` and `unpaid` map to `expired`; trialing, active, past_due, paused, and canceled retain their names. Demo store records use normalized status names directly. These are mock conventions, not Apple/Google API status mappings. Unknown products or inconsistent/unrecognized status mappings are reported in `warnings` and grant nothing.

| Normalized state | Access |
| --- | --- |
| `pending` | None |
| `active`, `trialing` | Until the verified `accessUntil` boundary |
| `active` + `cancelAtPeriodEnd` | Same boundary; scheduling cancellation does not end access early |
| `past_due` | Prior access plus the stored grace boundary, capped at `accessUntil + 24 hours` |
| `paused`, `canceled`, `expired`, `revoked` | None, even with a future timestamp |

`accessUntil` must represent a previously verified grant, never a nominal unpaid billing period. A null value cannot acquire grace. The writer sets `graceUntil` once from that prior boundary; a null grace value grants no additional time. Reads clamp an overlong grace boundary and do not let a shorter grace value remove already verified access. Updating `verifiedAt` or `revision` cannot move the boundary. A provider outage grants no extension: the last stored grant remains subject to its existing limits.

All boundaries are exclusive: `now < validUntil`. Valid grants from all providers are combined. Expiring/revoking one does not cancel another. `effectiveUntil` is the earliest current grant boundary, when the read model must next be recomputed; it is not necessarily the end of all Premium access.

Example entitlement response (synthetic):

```json
{
  "tier": "premium",
  "features": ["score_history"],
  "effectiveUntil": "2026-10-10T13:00:00.000Z",
  "evaluatedAt": "2026-10-10T12:00:00.000Z",
  "grants": [{
    "provider": "apple_mock",
    "providerSubscriptionId": "demo-p05-apple_mock",
    "revision": 1,
    "validUntil": "2026-10-10T13:00:00.000Z"
  }],
  "warnings": []
}
```

Source revisions describe stored subscription records. There is no aggregate revision or stored entitlement snapshot yet. Consistent paginated queries are not a transactional snapshot across pages; production provider writes and the atomic aggregate belong to P06. The P05 scenario writer only changes two demo records in one transaction.

## Local manual walkthrough

Start `pnpm db:up`, then start the BFF against DynamoDB Local using the [local setup](../infra/README.md#local-dynamodb-and-manual-requests). Launch the mobile app. Configure `read:premium` in [Auth0](AUTH0_SETUP.md#3-configure-user-permissions-and-application-access) and sign in again to obtain the new scope. Copy the internal UUID displayed on the dashboard.

Run commands from the repository root, replacing `<internal-user-id>`:

```sh
pnpm demo:subscription <internal-user-id> free
pnpm demo:subscription <internal-user-id> active
pnpm demo:subscription <internal-user-id> expiring
```

Reload the dashboard after each command and press **Request score history**. For T04, Free must return `403 premium_required` despite having the scope, and active must return the synthetic history. For T22, `expiring` creates a 30-second grant. Request history immediately, then wait past the displayed boundary and request it again: the API must deny access without another write/event. The dashboard automatically refreshes at the boundary and when returning to the foreground.

| Scenario | Expected result |
| --- | --- |
| `free` | Removes only the two P05 demo records; Free unless another subscription grants access |
| `active`, `trialing`, `canceling` | Premium for one hour |
| `pending`, `expired`, `revoked`, `paused`, `canceled` | Free |
| `grace` | Past due, prior access ended one hour ago; 23 hours of grace remain |
| `grace-expired`, `initial-failure` | Free; expired grace or no prior grant |
| `multiple` | Revoked Apple demo grant plus valid Google demo grant; Premium |
| `unknown-product`, `unknown-status` | Free plus a mapping warning |
| `expiring` | Premium for 30 seconds, then Free without another event |

The script requires an existing profile **in DynamoDB Local**. A profile in your AWS table has a different local counterpart; a locally running BFF may still use AWS if `DYNAMODB_ENDPOINT` is absent. Start it with `DYNAMODB_TABLE_NAME=premiumpass-local DYNAMODB_ENDPOINT=http://127.0.0.1:8000 pnpm dev`, reload the app, and use the ID returned by that database. Its endpoint, dummy credentials, and table are fixed to Compose's loopback DynamoDB Local. It atomically replaces/removes only its two marked records and refuses to overwrite unmarked collisions. Other records remain untouched. Running a scenario again deliberately creates a new demonstration period; this is not a provider event retry. Finish with `free` to remove demo grants.

For API inspection with a user access token obtained through the [documented CLI login](AUTH0_SETUP.md#get-a-user-token-now-with-the-auth0-cli):

```sh
curl -i http://127.0.0.1:3000/v1/me/subscriptions \
  -H "Authorization: Bearer $ACCESS_TOKEN"
curl -i http://127.0.0.1:3000/v1/me/entitlements \
  -H "Authorization: Bearer $ACCESS_TOKEN"
curl -i http://127.0.0.1:3000/v1/premium/score-history \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

All checks here are manual; no automated test suite is included.
