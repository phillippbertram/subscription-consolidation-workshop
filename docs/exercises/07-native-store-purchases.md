# Exercise 7: Native store purchases

**Goal:** understand how a purchase made inside an app is bound to the right
user, and why the backend, not the app, completes it.

Part A needs only the code. Part B needs a store test account and a device
([Google Play](../GOOGLE_PLAY.md) or [Apple Sandbox](../APPLE_PURCHASES.md)).

## Part A: compare the three providers

Fill in the table by reading the code, then compare with the answers below.

| Question                                   | Stripe | Apple | Google Play |
| ------------------------------------------ | ------ | ----- | ----------- |
| How does the purchase carry our user ID?   |        |       |             |
| Who tells the backend about the purchase?  |        |       |             |
| What must the backend do after the commit? |        |       |             |

Where to look:

- [`services/api/src/routes/apple.ts`](../../services/api/src/routes/apple.ts) and
  [`routes/google.ts`](../../services/api/src/routes/google.ts): the config each app requests.
- [`use-apple-purchase.ts`](../../apps/mobile/src/features/subscriptions/use-apple-purchase.ts) and
  [`use-google-purchase.ts`](../../apps/mobile/src/features/subscriptions/use-google-purchase.ts): the app side.
- [`apple/processor.ts`](../../packages/subscription-processing/src/providers/apple/processor.ts) and
  [`google/processor.ts`](../../packages/subscription-processing/src/providers/google/processor.ts): the worker side.

<details>
<summary>Answers</summary>

| Question                                   | Stripe                                 | Apple                                           | Google Play                                    |
| ------------------------------------------ | -------------------------------------- | ----------------------------------------------- | ---------------------------------------------- |
| How does the purchase carry our user ID?   | Stripe customer created by our backend | `appAccountToken` inside the signed transaction | `obfuscatedAccountId` in Google's API response |
| Who tells the backend about the purchase?  | Signed webhook                         | App sync **and** App Store notifications        | App sync **and** Pub/Sub notifications         |
| What must the backend do after the commit? | Nothing                                | Finish the transaction                          | Acknowledge within about three minutes         |

</details>

## Part B: on a device (optional)

1. Buy the subscription in the app with a test account.
2. Watch the app's message change from "Verifying…" to "synchronized", and the
   worker log `subscription.processed`.
3. In DynamoDB Admin, find the owner record
   (`PROVIDER#apple#SUB#Sandbox:…` or `PROVIDER#google#SUB#…`, sort key `OWNER`).
4. Sign out, sign in as your second test user, and tap **Restore**.
   **Expect:** an error that the purchase belongs to another account.

## Think about it

<details>
<summary>Why does the app never finish or acknowledge the purchase itself?</summary>

If the app finished first and the backend then failed, the store would consider
the purchase done while we never granted access. Google would even refund an
unacknowledged purchase. Committing first and completing second, with a durable
marker for retries, closes that gap.

</details>

<details>
<summary>The app checks the account token before syncing. Is that a security check?</summary>

No, it is only early, friendly feedback. A modified app could skip it. The real
check happens in the backend with the signed data from Apple or Google.

</details>
