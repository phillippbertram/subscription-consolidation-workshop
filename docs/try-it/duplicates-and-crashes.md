# Duplicates and crashes

See why duplicate jobs are harmless, how changes are announced
through the [outbox](../OUTBOX.md), and where the system could crash.

Use the test user with the Stripe subscription from
[A first purchase](first-purchase.md).

## Steps

1. Keep `pnpm dev` and `pnpm stripe:listen` running. In two more terminals
   start the outbox publisher and its log consumer:

   ```sh
   pnpm dev:events
   ```

   ```sh
   pnpm dev:outbox
   ```

2. On the website, choose **Cancel subscription** and confirm. Access stays
   until the end of the paid period, but the subscription now ends there.

   **Expect, in order:** webhook `webhook.queued`; worker
   `subscription.processed` with `outcome: changed`; publisher `outbox.sent`;
   consumer `subscription.changed`. The last three carry the same
   `domainEventId` of the form `<user-id>:<revision>`.

3. Ask the worker to check the same subscription again, twice:

   ```sh
   pnpm cli reconcile --user <user-id> --provider stripe
   pnpm cli reconcile --user <user-id> --provider stripe
   ```

   **Expect:** the worker logs `outcome: verified` both times and there is
   **no** new `outbox.sent`. Nothing changed, so nothing is announced.

4. Preview what the publisher would send, without sending:

   ```sh
   pnpm outbox:publish --dry-run
   ```

   **Expect:** no pending entries, because step 2 was already published.

## Where in the code

| File                                                                                                                | What to look for                                                       |
| ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| [`processing/retry.ts`](../../packages/subscription-processing/src/processing/retry.ts)                             | The duplicate check and the compare-and-swap retry loop                |
| [`processing/dynamodb-processing.ts`](../../packages/subscription-processing/src/processing/dynamodb-processing.ts) | `commit`: revision guard, profile check, and outbox in one transaction |
| [`services/outbox-publisher/src/publisher.ts`](../../services/outbox-publisher/src/publisher.ts)                    | Mark `sent` only after the transport accepted the event                |

## Why it works this way

Each crash moment below is safe. Open one to see what happens on the next
delivery.

<details>
<summary>The worker crashes before the database commit.</summary>

Nothing was written. The queue redelivers the job and it runs again from the start.

</details>

<details>
<summary>The worker crashes after the commit, before acknowledging the queue message.</summary>

The completion marker exists, so the redelivered job returns `duplicate` without
writing anything again.

</details>

<details>
<summary>The publisher crashes after sending an event, before marking it <code>sent</code>.</summary>

The entry is still pending, so the publisher sends it again. The consumer sees
the same `domainEventId` twice and can ignore the copy.

</details>

<details>
<summary>Why is the outbox entry written in the same transaction as the subscription?</summary>

If they were separate writes, a crash in between would either announce a change
that never happened or lose the announcement of one that did. One transaction
makes both happen together or not at all.

</details>

<details>
<summary>Two workers process jobs for the same user at the same time. What stops a lost update?</summary>

Both read the aggregate revision first. Only the first commit succeeds; the
second sees a different revision, fails, and the retry loop starts over with
fresh reads, so it includes the first worker's change.

</details>

The canceled subscription stays usable until its period ends;
[Missed updates and expiry](missed-updates.md) uses it once more.
