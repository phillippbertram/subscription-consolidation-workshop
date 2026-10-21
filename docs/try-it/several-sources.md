# Several sources at once

See one access rule combine several sources, and watch access end
exactly on time without any event.

Use a **second test user without a real purchase**. With a Stripe purchase from
[A first purchase](first-purchase.md), that user stays Premium no matter what you do here; that is the
union rule at work, but it hides the other effects.

## Steps

The `seed` command writes up to two marked demo records for one user; the
website shows them as "Apple demo". After each command, refresh the website and run
`pnpm cli list <user-id>`.

| Command                                   | Demo records                              | Expected access                         |
| ----------------------------------------- | ----------------------------------------- | --------------------------------------- |
| `pnpm cli seed <user-id> active`          | One demo record, active for one hour      | Premium                                 |
| `pnpm cli seed <user-id> multiple`        | First record revoked, second active (2 h) | Premium, through the second record only |
| `pnpm cli seed <user-id> grace`           | Renewal failed one hour ago               | Premium during the grace period         |
| `pnpm cli seed <user-id> grace-expired`   | Renewal failed 25 hours ago               | Free: grace is capped at 24 hours       |
| `pnpm cli seed <user-id> initial-failure` | First payment failed, no paid period      | Free                                    |
| `pnpm cli seed <user-id> unknown-status`  | Status the translation does not know      | Free, with a warning                    |
| `pnpm cli seed <user-id> expiring`        | Access for 30 seconds                     | Premium, then Free on refresh           |

For `expiring`: refresh after 40 seconds. Nothing ran in the background, yet
access is gone, because the API compares the end time with _now_ on every request.

Finish with `pnpm cli seed <user-id> free` to remove the demo records.

## Where in the code

| File                                                                                 | What to look for                                                        |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| [`packages/domain/src/subscriptions.ts`](../../packages/domain/src/subscriptions.ts) | `normalizeProviderStatus`, then the three steps of `deriveEntitlements` |
| [`services/api/src/access.ts`](../../services/api/src/access.ts)                     | Access is recomputed on every request                                   |

Find the line that caps grace at 24 hours, and the line that turns an
unknown status into a warning.

## Why it works this way

<details>
<summary>Why is access a list of grants instead of one "isPremium" flag?</summary>

With one flag, ending the Apple subscription would set it to false even though
Google still pays. A list lets each source end on its own; Premium is simply
"at least one valid grant".

</details>

<details>
<summary>Why does an unknown status grant nothing instead of keeping the last state?</summary>

Failing closed is safe: an unknown value might mean "refunded". The warning
keeps it visible so a developer can extend the translation table.

</details>

<details>
<summary>What is <code>effectiveUntil</code> good for if the API checks time anyway?</summary>

It tells background jobs when the stored snapshot must be refreshed, for
example to publish a "Premium ended" event. The API itself never relies on it.

</details>
