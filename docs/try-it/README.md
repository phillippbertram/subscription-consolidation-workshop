# Try it out

Six scenarios that test the running local system. Together they are the
checklist for "set up once, test everything". Each page has the same shape:

1. **Steps**: commands and clicks, each with the result you should see.
2. **Where in the code**: the few files that explain what just happened.
3. **Why it works this way**: short explanations to unfold.

## Before you start

- Finish the [local setup](../setup/README.md) once, so `pnpm dev` runs and
  you can sign in at `http://localhost:5173`.
- Read [Concepts](../CONCEPTS.md); the pages use its terms.
- Most commands need your **internal user ID**. Copy it from the account details
  on the website. The pages write it as `<user-id>`.
- Use only synthetic test users and test payment details.

The local CLI never touches AWS and only writes to your local database. To start
over, see [Reset local data](../DEVELOPMENT.md#reset-local-data).

## Test checklist

The order builds from a single API request to background repair. Duplicates and
crashes and Missed updates reuse the Stripe subscription from A first purchase;
the others run on their own.

| Scenario                                            | What it proves                                                                          | You need                                         |
| --------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------ |
| [Sign-in and tokens](sign-in-and-tokens.md)         | The API rejects missing or broken tokens. A valid token alone is not Premium.           | Getting started done                             |
| [A first purchase](first-purchase.md)               | Only the verified webhook path grants Premium. The success redirect proves nothing.     | `pnpm stripe:listen`                             |
| [Several sources at once](several-sources.md)       | Access is the union of all grants and ends on time without any event.                   | A second test user                               |
| [Duplicates and crashes](duplicates-and-crashes.md) | Duplicate jobs change nothing. Each change is announced once through the outbox.        | The Stripe subscription, outbox publisher        |
| [Missed updates and expiry](missed-updates.md)      | Reconciliation repairs a lost notification. Expiry recomputes without inventing status. | The Stripe subscription, Stripe Dashboard or CLI |
| [Complimentary Premium](complimentary-premium.md)   | An admin grant is one more grant: repeat-safe, audited, and revocable.                  | Getting started done                             |

## With real providers

After the optional setup steps, each guide ends with its own checks:

- [Payments: manual checks](../PAYMENTS.md#manual-checks) for the full list of
  Stripe scenarios, from a real test purchase to failed renewals and redrives.
- [Apple + iOS app: app checks](../setup/apple.md#app-checks) for sign-in,
  caching, and expiry in the app.
- [Apple + iOS app: device checks](../setup/apple.md#manual-device-checks)
  and [Google + Android app: first integration run](../setup/google.md#ready-for-the-first-integration-run)
  for real store purchases, including a restore on the wrong account.
- [AWS: verify the deployed path](../setup/aws.md#verify-the-deployed-path)
  for the cloud stack.
