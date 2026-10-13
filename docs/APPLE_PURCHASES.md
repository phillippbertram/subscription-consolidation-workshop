# Apple sandbox purchases

This local integration uses StoreKit through `expo-iap`, Apple's App Store Server API, and App Store Server Notifications V2. The only product is `premiumpass.premium.monthly.v2`, mapped to the internal `premium_monthly` plan. Apple production, Xcode StoreKit simulation, Family Sharing, upgrades, and real Google purchases are outside this flow. Implementation evidence and remaining device checks are recorded in [P07](TASKS.md#p07-apple-sandbox-and-google-mocks).

## Configure the worker key

Edit the existing ignored `services/subscription-worker/.env`. Configuration slots have been added without replacing existing Stripe or database values:

```dotenv
APPLE_ENABLED=true
APPLE_BUNDLE_ID=com.example.premiumpass
APPLE_PRODUCT_ID=premiumpass.premium.monthly.v2
APPLE_IAP_KEY_ID=YOUR_KEY_ID
APPLE_IAP_ISSUER_ID=YOUR_ISSUER_UUID
APPLE_IAP_PRIVATE_KEY_PATH="/absolute/path/SubscriptionKey_YOUR_KEY_ID.p8"
```

Replace `APPLE_BUNDLE_ID` with the exact bundle ID registered for your app and used by `IOS_BUNDLE_IDENTIFIER` in `apps/mobile/.env`. The local configuration slots already use the current app's bundle ID; the example above is a placeholder.

Copy **Key ID** and **Issuer ID** from App Store Connect → Users and Access → Integrations → In-App Purchase. `APPLE_IAP_PRIVATE_KEY_PATH` is the absolute path to the downloaded In-App Purchase `.p8` file, not the file contents. Do not use the general App Store Connect API key. Paths with spaces must be quoted; `~` is not expanded. Only the worker loads this private key. It is read at startup, so restart the worker after changing it. `.p8` files and `.env` files are ignored by Git; keep the key outside the mobile app.

The worker targets Apple's sandbox API exclusively. It verifies JWS signatures against the three public Apple root certificates bundled in `packages/apple-store/src/roots.ts`, with online revocation checking. Network access to Apple is required even though application storage runs locally. There is no mock or production fallback.

## Enable the local services

In `services/bff/.env`:

```dotenv
APPLE_ENABLED=true
APPLE_PRODUCT_ID=premiumpass.premium.monthly.v2
SUBSCRIPTION_QUEUE_URL=http://127.0.0.1:9324/000000000000/premiumpass-subscriptions
```

In `services/apple-webhook/.env`:

```dotenv
APPLE_ENABLED=true
APPLE_BUNDLE_ID=com.example.premiumpass
APPLE_PRODUCT_ID=premiumpass.premium.monthly.v2
SUBSCRIPTION_QUEUE_URL=http://127.0.0.1:9324/000000000000/premiumpass-subscriptions
```

Use the same actual bundle ID as the worker. All three services must select the same product and local queue; BFF and worker must use the same local DynamoDB table. Apple starts disabled until these settings are supplied. The webhook needs no private key. Existing Stripe configuration remains required by the shared development stack.

Restart `pnpm dev` after editing configuration. It now includes Apple ingress on `127.0.0.1:3003`. For individual startup use `pnpm dev:apple-webhook`. Health reports whether Apple verification is enabled:

```sh
curl --fail http://127.0.0.1:3003/health
```

For an iPhone, keep the existing [LAN setup](../apps/mobile/README.md#run-on-a-physical-iphone). The BFF must be reachable over LAN; the Apple ingress can remain loopback because the tunnel runs on this Mac.

## Build and sign in on the iPhone

The mobile app now requests `write:checkout` in addition to `read:me` and `read:premium`. Allow that scope for the Auth0 Native application's user-delegated API grant and the synthetic user's role. See [Auth0 application access](AUTH0_SETUP.md#application-access-policy). Sign out and sign in again to obtain the new scope. No Auth0 tenant changes were performed by this implementation.

The new native module requires a development-client rebuild:

```sh
pnpm --filter @premiumpass/mobile run prebuild:ios
cd apps/mobile/ios
pod install
cd ../../..
pnpm mobile:ios --device
```

Select the physical iPhone. Preserve the existing signing team and exact bundle ID. Use an App Store Connect sandbox tester on the device and ensure the scheme's StoreKit Configuration is **None** when testing against the real Apple sandbox. The product needs a price and localization and the Paid Applications Agreement must be active. Product metadata changes can take up to an hour to propagate. No TestFlight upload or App Review submission is needed for this development-signed flow.

The dashboard's **Premium with Apple** card loads the configured product and its localized price. **Subscribe** opens Apple's purchase sheet with the authenticated internal user's UUID as `appAccountToken`. **Restore purchases** explicitly synchronizes StoreKit and resubmits available and unfinished purchases. Pending transactions are also recovered on connection and when the app returns to the foreground.

After purchase, the app sends only the transaction ID to the authenticated BFF. It waits for the worker's committed completion marker before calling `finishTransaction`, then reloads backend entitlements. A timeout leaves the transaction unfinished; check worker logs and use Restore purchases or reopen the app to retry. Restoring with a different PremiumPass account is rejected; sign in with the original account. No automatic ownership transfer or email-based linking is performed.

## Receive Apple notifications through ngrok

With an installed/authenticated ngrok CLI and the local ingress running:

```sh
ngrok http 3003
```

In App Store Connect → your app → App Information → App Store Server Notifications, set the **Sandbox Server URL** to the tunnel's HTTPS origin followed by:

```text
/v1/webhooks/apple
```

Select **Version 2**. Update the URL if the tunnel address changes. Forward only port 3003; do not expose DynamoDB/Admin or the whole local stack. The tunnel is needed for Apple's incoming lifecycle notifications. App-to-BFF calls can continue over LAN, and the first purchase can synchronize through the BFF before notifications are configured.

Ingress verifies the Apple-signed notification and transaction before enqueuing minimal references. A verified `TEST` notification returns 200 without granting access. Invalid signed data returns 400; unavailable verification or queue delivery returns 503. A 200 notification response proves acceptance, not worker completion. Keep the tunnel and worker running during renewal/cancellation exercises. P09 will add scheduled recovery for missed notifications.

## Processing and ownership

| Boundary | Behavior |
|---|---|
| `GET /v1/billing/apple/config` | Auth0 `read:me` and `write:checkout`; returns product, Sandbox environment, and the current user's server-derived account token |
| `POST /v1/billing/apple/sync` | Auth0 `write:checkout`; accepts only a numeric transaction ID; returns 202 and an operation ID after queue acceptance |
| `GET /v1/billing/apple/sync/:operationId` | Auth0 `read:me`; returns completed only for this user's committed client operation |
| `POST /v1/webhooks/apple` on port 3003 | Apple signature verification; no Auth0 token required |
| Worker | Resolves signed transaction ownership, fetches current subscription status, verifies signed renewal data, and commits atomically |

`originalTransactionId` identifies the subscription lineage; its stored ID is `Sandbox:<originalTransactionId>`. Ownership cannot be reassigned. Provider/environment-scoped event markers, subscriptions, entitlement snapshots, owner bindings, and pending outbox entries use the existing revision-guarded transaction. On a conflict the worker reloads both the aggregate and current Apple state. Duplicate deliveries are harmless; a delayed notification does not replay old access state. Billing HTTP logs omit request/response bodies.

Apple status 1 grants access until verified expiry; 2 expires access; 3 permits only remaining verified access; 4 adds Apple's signed grace boundary; 5/revocation removes the Apple grant. Turning off auto-renewal alone preserves access until expiry. Apple grace is not replaced by the Stripe demo's 24-hour policy. Read-time expiry checks and union across providers remain in effect. Apple writes pending outbox records; publishing remains P08.

## Manual device checks

1. Use a synthetic Free user so an existing Stripe grant cannot hide Apple activation failures. Sign in, confirm the product price, and complete a sandbox purchase. After synchronization, Mobile and Web should show the same Apple grant and allow score history.
2. Restart and restore with the same user: ownership remains stable. Try another PremiumPass user: the original Apple purchase must not transfer.
3. Exercise sandbox renewal, auto-renewal cancellation, expiration, and configured billing grace. Inspect the worker outcome and refresh both clients.
4. Temporarily stop the worker during a purchase. The app must show pending verification and must not finish the transaction or invent Premium access. Restart, then restore.
5. Repeat notifications and restore; unchanged domain state should not create extra outbox changes. With a valid Stripe grant, end Apple access and confirm Premium remains.

Local fixtures used during development do not prove Apple sandbox delivery. Real device purchase, restore, Auth0 scope grant, and tunnel delivery still need to be verified with the user's key and account. Apple cloud secret/IAM/route wiring is not part of this local integration; AWS Apple processing remains disabled.

Sources: [Apple sandbox testing](https://developer.apple.com/documentation/storekit/testing-in-app-purchases-with-sandbox), [In-App Purchase keys](https://developer.apple.com/help/app-store-connect/configure-in-app-purchase-settings/generate-keys-for-in-app-purchases/), [Server Notifications](https://developer.apple.com/documentation/appstoreservernotifications/enabling-app-store-server-notifications), [Apple server library](https://github.com/apple/app-store-server-library-node), [Expo IAP](https://docs.expo.dev/guides/in-app-purchases/).
