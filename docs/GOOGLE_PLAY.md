# Google Play test purchases

Set up one Premium subscription for real Google Play **license-test purchases**.
Start with the local [Getting started](GETTING_STARTED.md) path. Implementation
and verification are tracked in [P12](TASKS.md#p12-google-play-test-purchases);
the existing `pnpm subscription:google-mock` command remains a separate synthetic local exercise.

Use your own development accounts, synthetic application data, and Google's test
payment instruments. Do not make production purchases.

## Setup order

| When                     | Action                                                                                | Ready when                                                           |
| ------------------------ | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Now                      | Prepare the developer account, app, package name, and license testers                 | Account requirements are cleared and the identifiers are recorded    |
| With the Android build   | Upload a signed Billing-enabled AAB to internal testing; configure the subscription   | Test release is available and the monthly base plan is active        |
| With backend integration | Configure API access and lifecycle notifications                                      | Backend can verify purchases and receive authenticated notifications |
| End to end               | Install, sign in, buy with a test instrument, restore, and exercise lifecycle changes | Recorded provider/device evidence satisfies P12                      |

Console labels can vary by language and account. The linked official pages were
reviewed on October 18, 2026.

## 1. Prepare the account and app

Use a [Google Play developer account](https://play.google.com/console/) whose
owner can complete the verification and agreements shown in its Dashboard.
Set up/link the Google payments profile required for billing products. Follow
the account's actual requirements; completing this guide does not verify an
account. [Google account and billing prerequisites](https://developer.android.com/google/play/billing/getting-ready).

Create an app named **PremiumPass**, choose its language, **App**, and **Free**
download. The subscription is a separate product. Complete required declarations
for the internal release using the actual demo behavior.

Choose the final unique Android package name **before uploading**. For example,
`com.yourcompany.premiumpass` is a placeholder to replace with your own identifier.
Set `ANDROID_PACKAGE_NAME` in `apps/mobile/.env`; it controls `android.package` in
[app.config.ts](../apps/mobile/app.config.ts). The default `com.example.premiumpass`
is for local verification only and is rejected by the signed-upload command.
The iOS bundle ID setting does not change Android.
An uploaded app's package name cannot later be changed.
[Internal release setup](https://support.google.com/googleplay/android-developer/answer/9845334?hl=en).

Internal testing is sufficient for this demo. The closed-testing requirements
for production access on newer personal accounts are a separate path; no public
production release is planned.
[Testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en).

## 2. Register the license tester

At the developer-account level, open **Settings → License testing**. Add a list
containing the Google account you will use in the device's Play Store and save.
This is separate from the app's internal-test invitation. Both lists should
contain the intended tester. [License testing setup](https://support.google.com/googleplay/android-developer/answer/6062777?hl=en).

During purchases, check the selected Google account and the test-purchase notice.
Choose **Test card, always approves** for the first purchase. If ordinary payment
methods appear without the test notice, stop and fix the tester/account setup.
Internal-track membership alone does not prevent real charges.
[Billing test behavior](https://developer.android.com/google/play/billing/test).

## 3. Upload the Android test build

The Android build must contain Google Play Billing support and use the chosen
package name. Upload a signed **Android App Bundle (AAB)** and configure Play App
Signing as prompted. Google requires a Billing-enabled upload to unlock the
billing product features. Use the local build commands below; an iOS JavaScript
export is not an Android native build.
[Billing-enabled build prerequisite](https://developer.android.com/google/play/billing/getting-ready).

In **Test and release → Testing → Internal testing**, create a release and add
the AAB. In **Testers**, select your tester email list, save, and roll out the
internal release. Use the opt-in link with that Google account, join the test,
and install from Google Play on Android hardware or a Play-enabled emulator.
Allow time for the release to become available.
[Internal track instructions](https://support.google.com/googleplay/android-developer/answer/9845334?hl=en).

After initial setup, license testers can also sideload development builds with
the same package name. This does not remove the Console/product setup requirement.
[Development-build testing](https://developer.android.com/google/play/billing/test).

### Local Android build

Install Android Studio with its bundled JDK, Android SDK/platform-tools, Android
SDK Platform 36, Build Tools 36.0.0, NDK 27.1.12297006, and CMake 3.22.1 (the
pinned Expo native defaults). Set `ANDROID_HOME` and
`JAVA_HOME` if automatic macOS discovery does not find them. Then:

```sh
pnpm mobile:android:doctor
pnpm --filter @premiumpass/mobile run prebuild:android
pnpm mobile:android
```

`mobile:android` installs a development build; Expo Go cannot load the native
Auth0/IAP modules. For an emulator, use `EXPO_PUBLIC_API_URL=http://10.0.2.2:3000`;
for a device, use the Mac's LAN address with `pnpm dev:api:lan`. The generated app
allows local HTTP for this demo. Register the Android Auth0 callback/logout URLs
before signing in: [Native configuration](AUTH0_SETUP.md#add-the-native-application).

For a Play upload, set `ANDROID_PACKAGE_NAME`, increment `ANDROID_VERSION_CODE`
for each upload, and configure the four `ANDROID_UPLOAD_KEY*` settings in the
ignored `apps/mobile/.env` (see its example). Create a dedicated upload keystore
with Android Studio's signed-bundle wizard or `keytool`; keep and back it up
privately. Use an absolute keystore path. Then:

```sh
pnpm mobile:android:aab
```

This regenerates Android without cleaning the iOS project and runs Gradle
`app:bundleRelease`. Output is
`apps/mobile/android/app/build/outputs/bundle/release/app-release.aab`.
The command rejects placeholder packages/missing signing configuration; generated
release builds do not fall back to the debug signing key. Credentials are read
from the environment, never command-line password arguments.

Before choosing an upload identity, `pnpm mobile:android:aab --unsigned` exercises
native compilation with no upload key. That bundle cannot be uploaded to Play.
Add `--verbose` for Gradle dependency/build diagnostics.
[Local release-build background](https://docs.expo.dev/guides/local-app-production/).

## 4. Create the subscription and base plan

Open **Monetize with Play → Products → Subscriptions → Create subscription**.
Use these recommended demo values; record any different IDs for the integration.

| Field                 | Recommended value                                                         |
| --------------------- | ------------------------------------------------------------------------- |
| Product ID            | `premium_monthly`                                                         |
| Name                  | `PremiumPass Premium`                                                     |
| Benefit               | `Synthetic score history`                                                 |
| Base plan ID          | `monthly`                                                                 |
| Renewal type / period | Auto-renewing / Monthly                                                   |
| Price                 | EUR 4.99/month in Germany; include the tester's Play country if different |
| Offers / free trial   | None for the first exercise                                               |

Save the subscription, add the base plan, configure price/region availability,
save, and **Activate** the base plan. A saved draft is insufficient. Product IDs
cannot be changed/reused after creation; activated base-plan IDs also cannot be
changed/reused. Offers are optional.
[Subscription and base-plan instructions](https://support.google.com/googleplay/android-developer/answer/140504?hl=en).

Record the selected grace-period and account-hold settings for the later payment
failure exercise. Backend access must follow verified provider state and the
project's [access policy](PAYMENTS.md#access-policy); a Console setting alone
does not implement that mapping.

## 5. Prepare backend API access

In your own Google Cloud development project, enable **Google Play Android
Developer API** and create a dedicated backend service account. In Play Console,
open **Users and permissions → Invite new users**, enter its service-account
email, and restrict app access to PremiumPass. Grant Google's documented billing
permissions: **View financial data, orders, and cancellation survey responses**
and **Manage orders and subscriptions**. Do not grant developer-account admin
access. Linking the developer account to a Cloud project through the older
API-access workflow is no longer required.
[Official API access setup](https://developers.google.com/android-publisher/getting_started).

Credentials belong only on the backend. If using a downloaded JSON key for local
development, keep it outside Git in an ignored/private location, never in mobile
`EXPO_PUBLIC_*` values. Record only its local path for backend configuration. Do not
paste the key into chat or documentation. The worker reads the file selected by
`GOOGLE_PLAY_SERVICE_ACCOUNT_FILE`; it has no implicit ADC credential fallback.

The backend verifies purchase tokens through `purchases.subscriptionsv2.get`,
including product/base plan, expiry, account ownership, and the `testPurchase`
marker. A client success callback cannot grant Premium. Pending purchases grant
nothing. [Subscription response reference](https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.subscriptionsv2).

## 6. Prepare lifecycle notifications

In the same development Cloud project, enable **Cloud Pub/Sub**, create a topic
(suggested name: `premiumpass-play-rtdn`), and grant
`google-play-developer-notifications@system.gserviceaccount.com` the **Pub/Sub
Publisher** role on that topic. Create a subscription to retain/receive its
messages. In the app's **Monetize → Monetization setup → Real-time developer
notifications**, enter `projects/<project-id>/topics/premiumpass-play-rtdn`,
enable subscription/voided-purchase notifications, save, and send a test message.
[RTDN setup](https://developer.android.com/google/play/billing/getting-ready).

A pull subscription can receive the setup test message before our receiver is
ready. For the intended local HTTP integration, configure an authenticated push
subscription only after its HTTPS receiver/tunnel exists. Select its push-auth
service account and audience; the receiver must validate Google's JWT signature,
issuer, audience, expiry, and expected verified service-account email. Google's
publisher account above is distinct from the backend and push-auth identities.
[Authenticated push setup](https://docs.cloud.google.com/pubsub/docs/authenticate-push-subscriptions).

Do not point Google at the existing Apple webhook: it verifies another protocol.
Keep DynamoDB/ElasticMQ private. A test notification proves transport only; actual
changes must trigger a fresh Google API read, then queue/worker processing. An AWS
deployment is not required for the local path. Review Pub/Sub pricing before
enabling resources; license-test purchases do not make Cloud resources free.
[Pub/Sub pricing](https://cloud.google.com/pubsub/pricing).

## 7. Enable local processing

In API and worker `.env` files, enable `GOOGLE_PLAY_ENABLED=true` and set the same
`GOOGLE_PLAY_PACKAGE_NAME`, `GOOGLE_PLAY_PRODUCT_ID`, and
`GOOGLE_PLAY_BASE_PLAN_ID`. Only the worker receives
`GOOGLE_PLAY_SERVICE_ACCOUNT_FILE`. Restart both services after configuration.
No Google private key belongs in the app or ingress.

Copy `services/google-webhook/.env.example` to `.env` if absent. Set the same
product settings plus the push audience, expected service-account email, and
full subscription name. Start `pnpm dev:webhook:google` separately; expose
`http://127.0.0.1:3004/v1/webhooks/google` through your HTTPS tunnel. Use that HTTPS
URL as `GOOGLE_PLAY_PUSH_AUDIENCE` and as the Pub/Sub audience/endpoint. Configure
the required Pub/Sub service-agent token-creator permission as described in the
[authenticated-push guide](https://docs.cloud.google.com/pubsub/docs/authenticate-push-subscriptions).
Keep Pub/Sub's wrapped payload format enabled.

API routes `/v1/billing/google/config`, `/sync`, and `/sync/:operationId` use the
existing Auth0 middleware/scopes. Config supplies the internal random UUID as
`obfuscatedAccountId`; only the Google API response proves its ownership.
Mobile passes the configured base-plan offer token, synchronizes purchased
tokens, and polls for the worker's recorded completion. Native Restore and
foreground recovery use the same path. Management opens Google Play; changes
refresh on return. The client does not acknowledge purchases itself.

The worker persists state, immutable token ownership, completion intent, and
outbox atomically. It then acknowledges Google and records completion; a retry
does not repeat the domain write. In grace, Google's verified expiry already
includes the access window. Account hold/pause/expiry grant no Google access.
Public subscription IDs contain a package-scoped token hash; only the private
provider record and queue contain the token. See the [data model](DYNAMODB_DATA_MODEL.md#google-play-records).

For missed updates, use `pnpm subscription:reconcile --provider google --dry-run`, then omit
`--dry-run` to queue refreshes. Discovery covers stored purchase tokens; an
unknown first purchase needs client sync/Restore or RTDN. Provider outages never
erase verified state. Optional AWS API/notification/worker wiring and
[five-minute cloud reconciliation](RECONCILIATION.md#cloud-google-reconciliation)
are described below. Plan replacements (`linkedPurchaseToken`),
offers/trials, additional base plans, and production purchases are rejected.

## AWS notification processing

The CDK stack includes protected Google billing routes in the API Lambda,
`POST /v1/webhooks/google`, and a Google webhook Lambda.
`GOOGLE_PLAY_ENABLED=false` is the default. Opting in enables the same test-only
worker processing path with a dedicated credential secret. This is infrastructure
preparation; deployment and Google account changes require their own setup.

1. Store the dedicated billing service-account JSON from step 5 as an existing
   Secrets Manager secret in the selected AWS account/region. Required fields are
   `type=service_account`, `client_email`, and `private_key`; preserve the PEM
   newlines. Only the worker can read it. No key belongs in Lambda environment
   variables, CDK parameters/assets, or the webhook. This demo uses a key secret;
   Workload Identity Federation would require separate cross-cloud trust setup.
   [AWS secret access](https://docs.aws.amazon.com/secretsmanager/latest/apireference/API_GetSecretValue.html).
2. In `infra/.env`, set `GOOGLE_PLAY_ENABLED=true`, the package/product/base-plan
   values, and `GOOGLE_PLAY_SECRET_ARN`. Also set the push audience, expected
   verified service-account email, and full Pub/Sub subscription name from step 6.
   The dedicated push-auth service account is separate from the billing key.
3. Use a stable HTTPS audience identifier, for example
   `https://billing.example.com/google-play-push`, and configure that exact value
   in Pub/Sub. It can differ from the receiver URL, allowing configuration before
   the generated API URL is known. Keep the subscription's wrapped payload format.
   [Google push authentication](https://docs.cloud.google.com/pubsub/docs/authenticate-push-subscriptions).
4. Follow [AWS setup and dry runs](../infra/README.md#deploy). After an authorized
   deployment, use `GoogleWebhookUrl` as the Pub/Sub push **endpoint**, retaining
   the configured audience. CDK creates no Google topic, subscription, account,
   key, or Play Console product. Do not point a live subscription at an undeployed
   endpoint.
5. Verify identity rejection, a valid TEST push, queue acceptance, worker
   completion, and matching cloud owner records separately. TEST messages do not
   enqueue purchase work. Queue failures or unconfirmed sends return 503 so Pub/Sub
   can retry. The worker reads current Google state before granting access,
   commits before purchase acknowledgement, and records completion before SQS
   acknowledgement. Cloud credential reads cache for up to five minutes; reused
   sources rebuild after a successful refresh. Failed reloads do not use an
   expired cached key.

Ingress has queue-send permission and public-key JWT verification, with no database
or secret access. The API receives conditional queue-send and Google completion-marker
read permission; it receives no Google key or provider-record write permission.
The worker receives conditional secret and Google record-family permissions only
when Google is enabled. Existing Stripe/Apple resource identities
and data retention are preserved. Local keys and cloud secrets are separate
sources; neither is an implicit fallback for the other.

### Authenticated cloud purchase and Restore

The API Lambda composes the same billing adapter as the local runtime. The CDK
Google opt-in supplies its public package/product/base-plan settings and queue URL;
no extra Auth0 scopes or Gateway authorizer are introduced. Authentication and
scope checks run in Hono before profile lookup, queue submission, or marker reads.

| Request                                                                   | Required scopes             | Successful result                                                            |
| ------------------------------------------------------------------------- | --------------------------- | ---------------------------------------------------------------------------- |
| `GET /v1/billing/google/config`                                           | `read:me`, `write:checkout` | 200: public product settings and this cloud user's internal UUID             |
| `POST /v1/billing/google/sync` with `{"purchaseToken":"SYNTHETIC_TOKEN"}` | `write:checkout`            | 202: `operationId` and `status=pending`, only after confirmed SQS acceptance |
| `GET /v1/billing/google/sync/<operationId>`                               | `read:me`                   | 200: `status=pending` or `status=completed` for the authenticated owner      |

Purchase and Restore use the same sync endpoint. It accepts only a purchase token;
the server supplies the owner and configured package. Completion requires the
worker's durable `completedAt` after verification, atomic persistence, and Google
acknowledgement. A committed but unfinished operation remains `pending`. Missing
and other users' operation IDs also return `pending`, so possession of an operation
ID cannot disclose someone else's completion. Disabled Google returns 503 after
authentication/scope checks; queue failures or unconfirmed sends return 503 rather
than an accepted operation. Malformed input/operation IDs return 400; request
bodies over 8 KiB return 413 with `google_request_too_large`.

After a separately authorized deployment, set mobile `EXPO_PUBLIC_API_URL` to
`ApiUrl`, retain the configured Auth0 issuer/audience and existing scopes, and
rebuild/restart the app as required by its environment setup. Fetch config from
that API before purchasing: Google's verified `obfuscatedExternalAccountId` must
match the **cloud** profile UUID. Local profiles, token ownership, and grants are
not copied or reassigned. Restoring a purchase bound to a different UUID is rejected;
use a separate license-test purchase for that cloud profile.

Verify token/scope rejection, two distinct user UUIDs, pending → completed polling,
wrong-user polling, Restore, acknowledgement retry, and Premium access separately.
The native Android client needs no browser CORS change. The same Google opt-in
enables the prepared [cloud reconciliation schedule](RECONCILIATION.md#cloud-google-reconciliation).
Local checks and synthesis do not establish real Google
delivery, deployed IAM, Android behavior, or purchase verification.

## Ready for the first integration run

Keep a small private setup record with the package name, product/base-plan IDs,
active regions, internal opt-in link, tester account, Cloud project ID, backend
service-account email, and topic/subscription names. These identifiers are not
credentials; avoid putting personal tester details in repository docs.

The first run must verify Android login, test purchase, backend-owned access,
purchase acknowledgement, restore, and wrong-user rejection. Google refunds
unacknowledged license-test purchases after about **three minutes**; the backend
must persist verified access before acknowledgement and retry failures durably.
Use Play Billing Lab later for renewal, grace, and account-hold exercises.
[Purchase testing and acknowledgement timing](https://developer.android.com/google/play/billing/test).

Use [P12](TASKS.md#p12-google-play-test-purchases) for the full acceptance record.
Pause through the internal-test track and cancel any retained test subscription
when finished. Stopping local processes does not stop provider renewals or Cloud
resources; remove only demo-specific subscriptions/topics/keys when retiring them.
