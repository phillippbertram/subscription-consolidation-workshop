# Complimentary Premium

Give Premium without a purchase, and see that it is just one more
grant next to the provider grants.

## Steps

1. Pick an expiry five minutes from now (UTC):

   ```sh
   UNTIL=$(date -u -v+5M +%Y-%m-%dT%H:%M:%SZ)                  # macOS
   UNTIL=$(date -u -d '+5 minutes' +%Y-%m-%dT%H:%M:%SZ)        # Linux / WSL
   ```

2. Preview, then grant:

   ```sh
   pnpm cli premium grant <user-id> --until "$UNTIL" --reason "Try it out" --dry-run
   pnpm cli premium grant <user-id> --until "$UNTIL" --reason "Try it out"
   ```

   Note the printed **request ID**. Refresh the website. **Expect:**
   "Complimentary Premium", separate from subscriptions, with no manage button.

3. Repeat the exact command with that request ID:

   ```sh
   pnpm cli premium grant <user-id> --until "$UNTIL" --reason "Try it out" --request-id <request-id>
   ```

   **Expect:** no new change; the audit receipt recognizes the retry.

4. Show the grant and its history: `pnpm cli premium list <user-id>`.

5. Overlap with a "purchase": run `pnpm cli seed <user-id> active`, then revoke
   the complimentary grant:

   ```sh
   pnpm cli premium revoke <user-id> --reason "Try it out done"
   ```

   **Expect:** still Premium, now through the demo subscription. Finish with
   `pnpm cli seed <user-id> free`.

## Where in the code

| File                                                                                                | What to look for                                  |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| [`packages/domain/src/admin-grants.ts`](../../packages/domain/src/admin-grants.ts)                  | One grant per user, optional expiry               |
| [`admin-grants/processor.ts`](../../packages/subscription-processing/src/admin-grants/processor.ts) | Validation, idempotency receipt, retries          |
| [`apps/cli/src/local-admin/premium.ts`](../../apps/cli/src/local-admin/premium.ts)                  | The CLI only parses flags and records the OS user |

## Why it works this way

<details>
<summary>Why is the grant not stored as a fake subscription?</summary>

Reconciliation refreshes subscriptions from providers. A fake one would be
"corrected" away, or worse, look like a real purchase. A separate record cannot
be touched by any provider update.

</details>

<details>
<summary>Who is allowed to grant Premium here, and is that safe for production?</summary>

Anyone with access to the local database through the CLI. That is fine for a
local demo, but production would need a real admin role, an authenticated
endpoint, and tamper-proof audit logs.

</details>
