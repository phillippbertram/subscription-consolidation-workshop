# Exercise 2: First purchase

**Goal:** follow one Stripe test payment from the checkout page to the database
and see why the redirect back to the website proves nothing.

## Steps

1. Make sure `pnpm dev` and `pnpm stripe:listen` run in separate terminals.

2. On the website, start checkout and pay with the test card
   `4242 4242 4242 4242` (any future date, any CVC).

3. Back on the website, read the URL and the message. **Expect:**
   `?checkout=success` and a note that this is _not_ payment verification.

4. In the `pnpm dev` terminal, find these log lines in order:

   | Log event                | Process             | Meaning                                        |
   | ------------------------ | ------------------- | ---------------------------------------------- |
   | `webhook.queued`         | stripe-webhook      | Signature verified, reference queued, 200 sent |
   | `subscription.processed` | subscription-worker | Current Stripe state read and committed        |

   Both lines share the same `correlationId`.

5. Click **Refresh account**. **Expect:** Premium and a Stripe subscription.

6. Open DynamoDB Admin at `http://127.0.0.1:8001`, table `premiumpass-local`,
   and find the records of this purchase:

   | Key                                   | What it is                              |
   | ------------------------------------- | --------------------------------------- |
   | `USER#<user-id>` / `SUB#stripe#sub_…` | The translated subscription             |
   | `USER#<user-id>` / `ENTITLEMENTS`     | The cached access snapshot and revision |
   | `EVENT#stripe#evt_…` / `PROCESSED`    | Completion marker: this event is done   |
   | `OUTBOX#<user-id>:<revision>`         | "Please announce this change"           |

7. Send a forged webhook:

   ```sh
   curl -i -X POST http://127.0.0.1:3002/v1/webhooks/stripe \
     -H 'stripe-signature: t=1,v1=forged' -d '{"type":"invoice.paid"}'
   ```

   **Expect:** `400` with `invalid_signature`, and nothing queued.

## Look at the code

| File                                                                                                        | What to look for                                     |
| ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| [`services/stripe-webhook/src/app.ts`](../../services/stripe-webhook/src/app.ts)                            | Verify raw bytes, queue a reference, then answer 200 |
| [`providers/stripe/processor.ts`](../../packages/subscription-processing/src/providers/stripe/processor.ts) | Load revision → read Stripe → translate → commit     |
| [`providers/stripe/normalize.ts`](../../packages/subscription-processing/src/providers/stripe/normalize.ts) | How a Stripe subscription becomes our shape          |

## Think about it

<details>
<summary>Why does the webhook queue only a reference instead of the event body?</summary>

Events can arrive late or out of order. The worker reads the _current_ state
from Stripe when it processes the job, so an old event can never overwrite newer
data.

</details>

<details>
<summary>Why answer 200 only after the queue accepted the job?</summary>

If the process crashed after answering 200 but before queuing, the event would
be lost. Answering after acceptance means the worst case is a duplicate, which
the completion marker makes harmless.

</details>

<details>
<summary>What would go wrong if Premium were granted on the success redirect?</summary>

Anyone could open the success URL without paying, and a payment that fails
later would still grant access. Only the backend's verified provider state counts.

</details>
