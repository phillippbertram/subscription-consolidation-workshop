# Missed updates and expiry

Lose a notification on purpose and let reconciliation repair it;
then see what the expiration job does and does not do.

## Part A: a missed notification (T20)

Use the test user with the Stripe subscription from
[A first purchase](first-purchase.md). The website shows Premium.

1. Keep `pnpm dev` running, but stop `pnpm stripe:listen` with `Ctrl+C`. From
   now on, Stripe events no longer reach the local webhook.

2. Cancel the subscription in Stripe, not on the website: in the Stripe
   Dashboard (test mode), open the customer's subscription and cancel it
   immediately. Or use the Stripe CLI with the `sub_…` ID that
   `pnpm cli list <user-id>` shows:

   ```sh
   stripe subscriptions cancel sub_…
   ```

   **Expect:** the website still shows Premium. Our data is now out of date.

3. Let reconciliation look for differences, first as a preview:

   ```sh
   pnpm cli reconcile --user <user-id> --provider stripe --dry-run
   ```

   **Expect:** a `reconciliation.stripe` row with `result: would update`.

4. Repair it:

   ```sh
   pnpm cli reconcile --user <user-id> --provider stripe
   ```

   **Expect:** `queued`, then the worker's `subscription.processed`. After a
   refresh the website shows Free (unless another source still grants Premium).

5. Start `pnpm stripe:listen` again. It forwards only new events; the missed
   one stays missed, which is why reconciliation exists.

`pnpm dev` also runs this check every five minutes by itself; step 4 just
saves you the wait.

## Part B: expiration without any event

After Part A the Stripe subscription is canceled, so only the demo record
grants access here.

1. Give the user 30 seconds of access: `pnpm cli seed <user-id> expiring`.
2. Wait 40 seconds and refresh the website. **Expect:** Free.
3. Now check the stored snapshot:

   ```sh
   pnpm cli reconcile --user <user-id> --provider none --dry-run
   ```

   **Expect:** `reconciliation.expiration_due`. The API already said Free, but the
   cached `ENTITLEMENTS` record still says Premium.

4. Run it without `--dry-run`. The worker recomputes the snapshot and writes an
   outbox event "Premium ended". Clean up with `pnpm cli seed <user-id> free`.

## Where in the code

| File                                                                                              | What to look for                                       |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| [`apps/cli/src/reconciliation/local-run.ts`](../../apps/cli/src/reconciliation/local-run.ts)      | One function per provider; `queueRefresh` for each row |
| [`processing/expiration.ts`](../../packages/subscription-processing/src/processing/expiration.ts) | Recompute only; never invent a provider status         |

## Why it works this way

<details>
<summary>Reconciliation only queues jobs. Why does it not fix the record directly?</summary>

The worker already knows how to verify ownership, translate state, and commit
atomically. Reusing it means there is exactly one code path that writes access,
whether the trigger was a webhook or a repair.

</details>

<details>
<summary>The provider API is down during reconciliation. Should we remove access?</summary>

No. Missing data is not evidence of cancellation. Existing verified boundaries
stay in force, and nothing is extended either; the next run tries again.

</details>

<details>
<summary>If the API already enforces expiry, why have an expiration job at all?</summary>

Other systems learn about changes only through the outbox. Without the job,
"Premium ended" would never be announced when no provider event arrives.

</details>
