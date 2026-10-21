# Exercises

One short, hands-on exercise per module of the [learning path](../../README.md#learning-path).
Each sheet has the same shape:

1. **Goal**: what you will understand afterwards.
2. **Steps**: commands and clicks, each with what you should see.
3. **Look at the code**: the few files that explain what just happened.
4. **Think about it**: questions with answers to unfold.

| Module                                                    | You need                                                  | Time   |
| --------------------------------------------------------- | --------------------------------------------------------- | ------ |
| [1. Login and tokens](01-login-and-tokens.md)             | Local setup with Auth0                                    | 20 min |
| [2. First purchase](02-first-purchase.md)                 | Stripe test mode                                          | 25 min |
| [3. Consolidation](03-consolidation.md)                   | Local setup, a second test user                           | 25 min |
| [4. Reliability](04-reliability.md)                       | Local setup                                               | 30 min |
| [5. Repair missed updates](05-repair-missed-updates.md)   | Local setup                                               | 20 min |
| [6. Complimentary Premium](06-complimentary-premium.md)   | Local setup                                               | 15 min |
| [7. Native store purchases](07-native-store-purchases.md) | Code reading; optional store developer account and device | 30 min |
| [8. AWS](08-aws.md)                                       | No AWS account for the core part                          | 25 min |

## Before you start

- Check [What you need](../../README.md#what-you-need): prior knowledge and
  which accounts each module requires.
- Finish [Getting started](../GETTING_STARTED.md) once, so `pnpm dev` runs and
  you can sign in at `http://localhost:5173`.
- Read [Concepts](../CONCEPTS.md); the sheets use its terms.
- Most commands need your **internal user ID**. Copy it from the account details
  on the website. The sheets write it as `<user-id>`.
- Use only synthetic test users and test payment details.

The local CLI never touches AWS and only writes to your local database. To start
over, see [Reset local data](../DEVELOPMENT.md#reset-local-data).
