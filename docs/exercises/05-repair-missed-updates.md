# Exercise 5: Repair missed updates

**Goal:** lose a notification on purpose and let reconciliation repair it;
then see what the expiration job does and does not do.

## Part A: a missed notification (T20)

1. Keep `pnpm dev` running. Create an active synthetic Google subscription:

   ```sh
   pnpm cli google-mock <user-id> mock_google_repair active
   ```

   Wait for `subscription.processed`. The website shows Premium.

2. Revoke it at the "provider", but suppress the notification:

   ```sh
   pnpm cli google-mock <user-id> mock_google_repair revoked --suppress-event
   ```

   **Expect:** the website still shows Premium. Our data is now out of date.

3. Let reconciliation look for differences, first as a preview:

   ```sh
   pnpm cli reconcile --user <user-id> --provider google_mock --dry-run
   ```

   **Expect:** a `reconciliation.google_mock` row with `result: would update`.

4. Repair it:

   ```sh
   pnpm cli reconcile --user <user-id> --provider google_mock
   ```

   **Expect:** `queued`, then the worker's `subscription.processed`. After a
   refresh the website shows Free (unless another source still grants Premium).

`pnpm dev` also runs this check every five minutes by itself; step 4 just
saves you the wait.

## Part B: expiration without any event

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

## Look at the code

| File                                                                                              | What to look for                                       |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| [`apps/cli/src/reconciliation/local-run.ts`](../../apps/cli/src/reconciliation/local-run.ts)      | One function per provider; `queueRefresh` for each row |
| [`processing/expiration.ts`](../../packages/subscription-processing/src/processing/expiration.ts) | Recompute only; never invent a provider status         |

## Think about it

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
