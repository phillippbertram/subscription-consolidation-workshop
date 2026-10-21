# Apple Sandbox purchases

Add native purchase/restore to the [local demo](GETTING_STARTED.md). Use a physical
iPhone, an Apple Developer Program membership with permission to create App Store
Connect resources, and a Sandbox Apple Account. Complete the
[mobile configuration](../apps/mobile/README.md#configure-the-app) first; prepare
the resources below before the signed iPhone build.

## How a purchase works

Three parties take part: the **app** shows Apple's purchase sheet, the **App
Store** takes the payment, and the **backend** decides about Premium.

```mermaid
sequenceDiagram
    autonumber
    box rgb(239, 246, 255) iPhone
        participant App as PremiumPass app
    end
    box rgb(244, 244, 245) Apple
        participant Store as App Store
    end
    box rgb(240, 253, 250) PremiumPass
        participant Backend as Backend
    end
    App->>Backend: Which product? Who am I?
    Backend-->>App: Product ID + appAccountToken (= your user ID)
    App->>Store: Buy, with the appAccountToken attached
    Store-->>App: Signed transaction, token included
    App->>Backend: Please check this transaction
    Backend->>Store: Fetch the signed transaction and current status
    Note over Backend: Check signature, product, Sandbox,<br/>and that the token is this user
    Backend->>Backend: Save Premium in one atomic write
    Backend->>Store: Finish the transaction
    App->>Backend: Done yet?
    Backend-->>App: Completed, show Premium
```

| Who     | Does                                                                    | Never does                                   |
| ------- | ----------------------------------------------------------------------- | -------------------------------------------- |
| App     | Fetch config, open the purchase sheet, send the transaction ID, wait    | Grant Premium or finish the transaction      |
| Backend | Verify with Apple, check the owner, save access, finish the transaction | Trust what the app says without asking Apple |

**What is the `appAccountToken` for?** Apple lets an app attach one UUID to a
purchase, and signs it into the transaction. We use the internal user ID. That
way the backend can prove which PremiumPass account bought the subscription,
even when the purchase arrives later through a notification or a restore. If
the token belongs to a different user, the purchase is rejected.

**How is a transaction completed?** StoreKit keeps every transaction
_unfinished_ until someone finishes it, and delivers unfinished ones again on
the next app start. Here only the backend finishes it, and only after Premium is
saved (step 8, Apple's Finish Transaction API). If anything fails before that,
Apple simply delivers the transaction again; nothing is lost and nothing is
granted twice.

## How later changes arrive

After the purchase, the app is no longer needed. Renewals, cancellations,
refunds, and billing problems reach the backend as **App Store Server
Notifications**: Apple calls the webhook directly.

```mermaid
sequenceDiagram
    autonumber
    box rgb(244, 244, 245) Apple
        participant Store as App Store
    end
    box rgb(240, 253, 250) PremiumPass backend
        participant Hook as Webhook
        participant Queue as Queue
        participant Worker as Worker
    end
    Note over Store: Something changed:<br/>renewal, cancellation, refund …
    Store->>Hook: Signed notification
    Hook->>Hook: Verify Apple's signature
    Hook->>Queue: Queue a reference (transaction ID)
    Hook-->>Store: 200 OK, only after the queue accepted it
    Queue->>Worker: Deliver the job
    Worker->>Store: Fetch the current signed status
    Note over Worker: Owner is already known:<br/>bound at the first purchase
    Worker->>Worker: Save the new state in one atomic write
    Worker->>Store: Finish the transaction
    Note over Worker: The app shows the change<br/>on its next refresh
```

- **Only a reference is queued.** Notifications can arrive late, twice, or out
  of order. The worker always asks Apple for the _current_ state, so an old
  notification can never overwrite newer data.
- **200 only after the queue accepted it.** If queuing fails, the webhook
  answers 503 and Apple sends the notification again later.
- **Duplicates are harmless.** A completion marker per notification makes a
  second delivery a no-op.
- **Lost notifications are repaired.** Every five minutes, reconciliation asks
  Apple again about known purchases and queues the same kind of job
  ([Reconciliation](RECONCILIATION.md)).
- `TEST` notifications from App Store Connect are acknowledged without any job.

## Prepare your Apple resources

| Step | Create or configure                                                                     | Keep for configuration                                             |
| ---- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 1    | Explicit bundle ID in your developer account; matching App Store Connect app            | Bundle ID, also used for Xcode signing and `IOS_BUNDLE_IDENTIFIER` |
| 2    | Active Paid Applications Agreement and required account information                     | Permission to test In-App Purchases                                |
| 3    | One subscription group and monthly auto-renewable subscription, with price/localization | Product ID, e.g. `premiumpass.premium.monthly.v2`                  |
| 4    | Sandbox Apple Account under Users and Access                                            | Device sandbox sign-in; separate from the app's Auth0 identity     |
| 5    | In-App Purchase key under Users and Access → Integrations → In-App Purchase             | Key ID, Issuer ID, downloaded `.p8` file                           |

Use your own registered identifiers consistently. The configured Apple product
maps to the internal `premium_monthly` plan. The worker needs an **In-App Purchase
key**, not a general App Store Connect API key. Keep the downloaded private key
outside the app and repository.
[Apple setup](https://developer.apple.com/help/app-store-connect/configure-in-app-purchase-settings/overview-for-configuring-in-app-purchases/)
· [Generate the key](https://developer.apple.com/help/app-store-connect/configure-in-app-purchase-settings/generate-keys-for-in-app-purchases/).

## Enable local processing

Set these values once in `config/.env` and run `pnpm config:sync`:

| Setting            | Value                         | Programs that receive it                                            |
| ------------------ | ----------------------------- | ------------------------------------------------------------------- |
| `APPLE_ENABLED`    | `true`                        | API, Apple webhook, worker, CLI                                     |
| `APPLE_PRODUCT_ID` | The subscription's product ID | API, Apple webhook, worker, CLI, AWS                                |
| `APPLE_BUNDLE_ID`  | The registered bundle         | Apple webhook, worker, CLI, AWS; the app as `IOS_BUNDLE_IDENTIFIER` |

The app's bundle identifier and the verified bundle now come from one setting,
so they cannot drift apart. Only the worker and the CLI receive the private key:

```dotenv
APPLE_IAP_KEY_ID=YOUR_KEY_ID
APPLE_IAP_ISSUER_ID=YOUR_ISSUER_UUID
APPLE_IAP_PRIVATE_KEY_PATH="/absolute/path/SubscriptionKey_YOUR_KEY_ID.p8"
```

Use an absolute path; `~` is not expanded. Keep the Stripe settings: the shared
worker still requires them. Restart the stack after changes; `pnpm dev` syncs
first. Apple verification needs network access to Apple
and always targets Sandbox; there is no production or mock fallback.

```sh
curl --fail http://127.0.0.1:3003/health
```

**Expected:** `appleEnabled` is `true`. This confirms configuration, not a purchase.

## Build and purchase on iPhone

1. Grant the Native Auth0 client/user `write:checkout` as described in
   [Auth0 setup](AUTH0_SETUP.md#application-access-policy), then sign out/in.
2. Follow the [iPhone LAN and signing steps](../apps/mobile/README.md#run-on-a-physical-iphone).
   Rebuild the development client for the native `expo-iap` module.
3. On the iPhone, open **Settings → Developer → Sandbox Apple Account** and sign
   in with the tester created in App Store Connect. This is separate from Auth0
   login. Set Xcode's scheme **StoreKit Configuration** to **None** for real
   Sandbox testing. Product metadata can
   take time to become available; simulation is a different verification path.
   [Apple sandbox testing](https://developer.apple.com/documentation/storekit/testing-in-app-purchases-with-sandbox).
4. Sign into PremiumPass with a synthetic Free user and choose **Subscribe**.
   The worker verifies and commits the purchase, then finishes it with Apple.
   The app waits for that completion; compare access in Web and Mobile.

**1. Purchase and processing triggers.** The app buys through StoreKit. Separately,
Apple pushes **App Store Server Notifications** for purchases and later lifecycle
changes, even while the app is closed. Either queue entry starts processing;
delivery order is not guaranteed, and the worker never waits for both.

```mermaid
sequenceDiagram
    participant App as Mobile (iPhone)<br/>@premiumpass/mobile
    participant Apple as App Store
    participant API as API<br/>@premiumpass/api
    participant Webhook as Apple webhook<br/>@premiumpass/apple-webhook
    participant Queue as SQS / ElasticMQ
    App->>API: Get product and appAccountToken
    API-->>App: Sandbox config
    App->>Apple: Purchase through StoreKit
    Apple-->>App: Transaction
    par App synchronization
        App->>API: Submit transaction ID
        API->>Queue: Queue owned sync
        API-->>App: Pending operation
    and Independent Server Notifications
        Apple->>Webhook: POST /v1/webhooks/apple (via ngrok locally)
        Webhook->>Webhook: Verify signed notification
        Webhook->>Queue: Queue supported transaction
        Webhook-->>Apple: 200 after queue acceptance
    end
```

**2. Worker calls to the App Store Server API.** Each new job follows the same
verification and persistence path. These requests originate in our backend;
notifications arrive independently of them. A webhook `200` confirms queue
acceptance, while the app polls its own API operation until `finishedAt` is saved.

```mermaid
sequenceDiagram
    participant Worker as Subscription worker<br/>@premiumpass/subscription-worker
    participant AppleAPI as App Store Server API
    participant DB as DynamoDB
    Worker->>AppleAPI: Get Transaction Info
    AppleAPI-->>Worker: Signed submitted transaction
    Worker->>AppleAPI: Get All Subscription Statuses
    AppleAPI-->>Worker: Current signed subscription state
    Worker->>Worker: Verify signatures and ownership
    Worker->>DB: Commit grants, owner, marker and outbox atomically
    DB-->>Worker: Committed with finishTransactionId
    Worker->>AppleAPI: Finish Transaction (stored transaction ID)
    AppleAPI-->>Worker: Success
    Worker->>DB: Record finishedAt
    Worker->>Worker: Acknowledge queue job
```

- **Only the backend finishes.** The app never calls `finishTransaction`, and
  automatic StoreKit finishing stays off. The worker calls Apple's
  [Finish Transaction API](https://developer.apple.com/documentation/appstoreserverapi/finish-transaction)
  after the database commit; failures retry from the stored marker
  ([recovery](#processing-and-ownership)).
- **One path for everything.** Restore and unfinished-transaction recovery reuse
  the same sync. Closing the app or a polling timeout does not cancel queued
  work; restore or reopen to check again.
- **Manage Apple subscription** opens Apple's native sheet and refreshes known
  subscriptions when it closes.
- **Duplicate exercises:** existing Premium normally hides a new purchase. The
  development-only Sandbox switch in Developer tools allows a second purchase;
  it never bypasses server ownership or signature checks.

## Receive Apple notifications through ngrok

The iPhone calls the API over LAN. Apple needs a public HTTPS endpoint to deliver
lifecycle changes to the separate local notification service.

```mermaid
flowchart LR
    Apple["Apple Sandbox"] -->|"HTTPS notification"| Tunnel["ngrok"]
    Tunnel --> Router["Local webhook router :3005"]
    Router --> Ingress["Apple webhook :3003<br/>@premiumpass/apple-webhook"]
    Ingress -->|"Verified references"| Queue["ElasticMQ"]
    Queue --> Worker["Subscription worker<br/>@premiumpass/subscription-worker"]
    Worker --> DB["DynamoDB Local"]
```

1. Create your own ngrok account and install the CLI using the
   [ngrok quickstart](https://ngrok.com/docs/share-localhost/quickstart)
   (`brew install ngrok` on macOS). Configure its
   authtoken locally with `ngrok config add-authtoken YOUR_AUTHTOKEN`; do not
   save the actual token in repository files or documentation. Use the installation
   and account steps only; browser-login protection would block Apple notifications.
2. With the enabled Apple ingress running, open a separate terminal:

   ```sh
   pnpm webhooks:listen
   ```

   This starts Stripe forwarding and one ngrok tunnel to a local router on port 3005. The same HTTPS origin also accepts Google's webhook path. Do not run a
   second Stripe listener or ngrok process alongside it.
   [Shared forwarding](DEVELOPMENT.md#receive-provider-webhooks-together).

3. Copy the public **HTTPS** origin. In App Store Connect → your app → App
   Information → App Store Server Notifications, set **Sandbox Server URL** to
   `https://YOUR_NGROK_HOST/v1/webhooks/apple` and select **Version 2**.
   [Apple URL configuration](https://developer.apple.com/help/app-store-connect/configure-in-app-purchase-settings/enter-server-urls-for-app-store-server-notifications/).
4. Update that URL whenever the tunnel address changes. The router forwards only
   the Apple and Google webhook POST paths to ports 3003 and 3004; it does not
   expose the database, admin UI, or API.
5. Request an Apple test notification, then check its delivery status. The
   following optional command uses the existing worker credentials and installed
   Apple library; it makes a real Sandbox test-notification request, not a purchase:

   ```sh
   pnpm --filter @premiumpass/subscription-worker exec tsx --env-file=.env -e '
   import { createAppleClient, readAppleSettings, readLocalAppleCredentials } from "@premiumpass/apple-store";
   async function main() {
     const settings = readAppleSettings(process.env);
     if (!settings) { throw new Error("Enable Apple first."); }
     const client = createAppleClient(settings, readLocalAppleCredentials(process.env));
     const result = await client.requestTestNotification();
     if (!result.testNotificationToken) { throw new Error("No test notification token returned."); }
     await new Promise((resolve) => setTimeout(resolve, 5000));
     const status = await client.getTestNotificationStatus(result.testNotificationToken);
     console.log(status.sendAttempts ?? "Delivery pending; check the tunnel request inspector.");
   }
   main().catch(() => { console.error("Test request failed; check Apple settings and network access."); process.exitCode = 1; });
   '
   ```

   Expect a POST and HTTP 200 in ngrok's local request inspector. The response
   for a verified test is `{"received":true,"test":true}`; no subscription job
   or Premium grant is created. If pending, inspect the incoming request before
   issuing another test. [Apple test notification API](https://apple.github.io/app-store-server-library-node/classes/AppStoreServerAPIClient.html#requestTestNotification).

6. Exercise a real Sandbox renewal/cancellation with tunnel and worker running.
   Follow `apple.notification_queued` and worker processing into the local
   subscription records, then refresh access. This separately verifies the
   processing path that a `TEST` notification does not exercise.

| Result                                         | Meaning                                                      |
| ---------------------------------------------- | ------------------------------------------------------------ |
| `400`                                          | Invalid notification/signature                               |
| `503`                                          | Disabled ingress, unavailable verification, or queue failure |
| `200` for supported lifecycle event            | Queue accepted; worker completion still needs checking       |
| Verified `TEST` or intentionally ignored event | Acknowledged without a subscription change                   |

## Processing and ownership

- **Verification:** Sandbox environment, bundle, product, signed state, and
  `appAccountToken` (our internal user ID).
- **Ownership:** `Sandbox:<originalTransactionId>` is bound to one internal user
  forever; restoring with another Auth0 identity cannot transfer it.
- **One transaction:** ownership, subscription, all-provider entitlements,
  processing marker, and any outbox change commit together. The marker stores the
  exact verified `finishTransactionId`.
- **Concurrency:** conflicts reload current state; duplicates never extend access.

| Interruption                                     | Recovery                                                          |
| ------------------------------------------------ | ----------------------------------------------------------------- |
| Before database commit                           | Retry verification and commit; no Apple finish yet                |
| After commit, before/during Apple finish         | Retry only the stored finish target; do not rewrite grants/outbox |
| Apple finished, but saving `finishedAt` failed   | Repeat the same Apple finish, then record success                 |
| After `finishedAt`, before queue acknowledgement | A duplicate skips both domain writes and Apple finish             |

- Access starts with the commit; API polling stays `pending` until `finishedAt`
  is saved. A finish failure never rolls back or extends access.
- Repeated failures reach the DLQ: fix the cause, then redrive the original message.
- Local ElasticMQ messages are lost on restart. After a queue reset, restore
  purchases to enqueue a new sync. Old demo markers without a finish target also
  need a new sync/Restore.
- Apple grace follows its signed boundary. Turning off renewal keeps access until
  the verified expiry; expiry or revocation removes only the Apple grant.
  [Access policy](PAYMENTS.md#access-policy) · [Apple records](DYNAMODB_DATA_MODEL.md#apple-sandbox-records).

## Local reconciliation

Configure Apple separately for the [CLI](../apps/cli/README.md#configuration)
and the [worker](#enable-local-processing), then preview and enqueue a refresh:

```sh
pnpm cli reconcile --user <internal-user-id> --provider apple --dry-run
pnpm cli reconcile --user <internal-user-id> --provider apple
```

- Keep `pnpm dev:worker` running. The commands call the real Apple Sandbox API;
  database and queue stay local.
- Discovery revisits stored `Sandbox:<originalTransactionId>` purchases with
  [Get All Subscription Statuses](https://apple.github.io/app-store-server-library-node/classes/AppStoreServerAPIClient.html#getAllSubscriptionStatuses).
  It cannot find a first purchase that never reached the database; use
  purchase/Restore or a signed notification for that.
- After the commit, the worker finishes the latest signed transaction through the
  same [finish-retry path](#processing-and-ownership). A retry keeps that exact
  target even if another renewal happens; the next run picks up the renewal.

All-user runs, the watcher, and diagnostics: [Reconciliation](RECONCILIATION.md).

## AWS notification processing

The AWS stack processes Apple notifications, but has no app-to-API Apple sync:
purchases from the app still need the local API
([what runs where](ARCHITECTURE.md#what-runs-where)).

1. Create a Secrets Manager JSON secret with `keyId`, `issuerId`, and
   `privateKey` (complete P-256 PEM, newlines encoded as `\n`). Only the worker
   reads it; the webhook needs no private key. Secrets are cached for five minutes.
2. Follow the [AWS setup](../infra/README.md#deploy) with `APPLE_ENABLED=true`,
   your bundle and product IDs, and `APPLE_SECRET_ARN`.
3. Register the **AppleWebhookUrl** output instead of ngrok as the Sandbox URL.
4. Verify TEST and lifecycle delivery separately. The signed account token must
   match a profile in the AWS table; local users are not copied there.

**Cloud reconciliation:** `RECONCILIATION_APPLE_ENABLED=true` (requires
`APPLE_ENABLED=true`) adds Apple to the [shared schedule](RECONCILIATION.md#cloud-reconciliation).
Discovery only scans known Sandbox purchases and has no Apple key; the worker
verifies and finishes as above.

## Manual device checks

| Check                                                                 | Expected result                                                                         |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Purchase as Free user; compare Web/Mobile                             | Matching internal user, verified Apple grant, protected scores                          |
| Restart/restore; restore as another user                              | Stable ownership; wrong-user restore rejected                                           |
| T10–T12: duplicates, delayed notifications, concurrent Stripe changes | Current state wins; no lost or duplicate grant                                          |
| T13/T14: renewal disabled, expiry, grace                              | Access follows verified boundaries                                                      |
| T15: stop worker/provider access during purchase                      | Pending verification; no premature finish or access                                     |
| Fail Apple finish after commit; retry the same job                    | Access committed, operation pending; retry finishes without another domain/outbox write |
| Lose response/save after Apple finish; redeliver                      | Repeat the same finish safely; acknowledge only after `finishedAt` is stored            |
| Close app after enqueue, then reopen                                  | Worker completes independently; restored account reflects backend state                 |
| Manage subscription, close sheet                                      | Refreshed renewal state and retained paid access                                        |
| End Apple while Stripe remains valid                                  | Premium remains                                                                         |
| Development-only duplicate override                                   | Store outcome visible; ownership checks still enforced                                  |

## Cleanup

Pause by stopping ngrok. For a longer pause or retirement, remove this demo's
**Sandbox Server URL** in App Store Connect, or replace it with the intended AWS
URL. Changing URLs redirects subsequent delivery; it does not migrate records.

Use the device's Sandbox subscription management to turn off renewal if retiring
a test subscription. Clearing purchase history is a separate destructive Sandbox
operation; it does not clear PremiumPass records or reassign ownership.
[Sandbox account settings](https://developer.apple.com/help/app-store-connect/test-in-app-purchases/manage-sandbox-apple-account-settings/).

Revoke an In-App Purchase key only if it was dedicated to this demo and no other
app/backend uses it; remove its local `.p8` file afterward. Keep shared developer
accounts and signing assets. Continue with [overall cleanup](DEVELOPMENT.md#cleanup).
