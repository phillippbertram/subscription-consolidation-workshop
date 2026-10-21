# PremiumPass Mobile

An Expo development app with Auth0 login, synthetic score history, and shared
subscription access. Start with [Getting started](../../docs/GETTING_STARTED.md).
Native purchase/restore is a separate [Apple Sandbox setup](../../docs/APPLE_PURCHASES.md).
For Android, follow [Google Play preparation](../../docs/GOOGLE_PLAY.md); Android
commands, upload signing, emulator networking, and Google configuration are in
the [Android build guide](../../docs/GOOGLE_PLAY.md#local-android-build). The
setup below covers iOS.

## Configure the app

You need macOS, Xcode with an iOS Simulator, CocoaPods, and the repository's pinned
toolchain. Follow [Expo's Xcode/Simulator setup](https://docs.expo.dev/workflow/ios-simulator/)
and [install CocoaPods](https://guides.cocoapods.org/using/getting-started.html).
Open Xcode once to finish installation, install an iOS Simulator runtime, and
select Xcode under Settings → Locations → Command Line Tools. Check
`xcodebuild -version` and `pod --version` before building.
Expo Go cannot run the native Auth0/IAP modules; no EAS account is needed.
Create the [Auth0 Native application](../../docs/AUTH0_SETUP.md#add-the-native-application),
then set these in `config/.env` ([setup](../../docs/GETTING_STARTED.md#2-create-the-configuration)).
`pnpm config:sync` writes `apps/mobile/.env`; the mobile scripts sync first.

| Setting in `config/.env` | The app receives it as        | Your value                                                |
| ------------------------ | ----------------------------- | --------------------------------------------------------- |
| `AUTH0_DOMAIN`           | `EXPO_PUBLIC_AUTH0_DOMAIN`    | Shared with Web and API, without scheme or trailing slash |
| `MOBILE_AUTH0_CLIENT_ID` | `EXPO_PUBLIC_AUTH0_CLIENT_ID` | Native application's Client ID                            |
| `AUTH0_AUDIENCE`         | `EXPO_PUBLIC_AUTH0_AUDIENCE`  | Shared Custom API identifier                              |
| `MOBILE_API_URL`         | `EXPO_PUBLIC_API_URL`         | `http://127.0.0.1:3000` for Simulator                     |
| `APPLE_BUNDLE_ID`        | `IOS_BUNDLE_IDENTIFIER`       | Your signing bundle ID; default `com.example.premiumpass` |

These are public values embedded in the app. Keep secrets out. Match the bundle
ID and Auth0 callback before prebuild. The app uses PKCE and SDK secure storage;
no refresh token is requested. Sign in again when credentials cannot be renewed.

## Run on the iOS Simulator

Keep the configured backend running with `pnpm dev`. For API-only work, use
`pnpm local:up` and `pnpm dev:api` instead. In a separate terminal:

```sh
pnpm mobile:ios
```

This builds/installs the development app and starts Metro. Later JavaScript work
only needs `pnpm dev:mobile`; press `i` to open the installed iOS app. Rebuild after
native dependency, Auth0 domain, scheme, or bundle changes. Edit `app.config.ts`,
not generated native settings, for persistent configuration.

**Check:** sign in, open Account and Developer tools, and compare the internal
user ID with Web. Simulator can reach the Mac's loopback address.

## Run on a physical iPhone

1. Connect and trust the device; enable iOS Developer Mode. Use the same trusted
   Wi-Fi network. Set your registered bundle ID in `.env` and use your own Xcode
   signing team. For Apple Sandbox, prepare the Apple resources first.
2. Stop an older loopback API and run the full stack with LAN access:

   ```sh
   HOST=0.0.0.0 pnpm dev
   ```

3. In the mobile terminal, set the Mac's private IPv4 address or `.local` hostname:

   ```sh
   export EXPO_PUBLIC_API_URL=http://your-mac.local:3000
   ```

   Replace `your-mac` with `scutil --get LocalHostName` output and append `.local`.
   Open this URL plus `/health` in iPhone Safari and expect `{"status":"ok"}`.
   `localhost` on the phone refers to the phone, not the Mac.

4. Apply native configuration and select the connected device:

   ```sh
   pnpm --filter @premiumpass/mobile run prebuild:ios
   cd apps/mobile/ios
   pod install
   cd ../../..
   pnpm mobile:ios --device
   ```

   If signing is required, open `apps/mobile/ios/PremiumPass.xcworkspace` in Xcode,
   add your Apple account in Settings → Accounts, then select the app target and
   your team under Signing & Capabilities with automatic signing enabled. Retry.
   The prebuild script uses `--no-clean` to preserve existing signing settings.
   Allow Local Network access
   on the device. Stop an older localhost-only Metro process first.

5. For later runs, use `pnpm dev:mobile:lan` in the terminal with the API override.
   Alternatively save the LAN URL as `MOBILE_API_URL` in `config/.env`; an
   exported value lasts only for that shell. The API address does not change the Auth0 callback URL.

## App structure

The app follows the website's design: the same light theme tokens, Lucide icons,
and page structure. Signed out, a compact landing screen leads to sign-in.
Signed in, three tabs mirror the website's pages: **Overview**, **Billing**,
and **Account**.

| Area                                                 | Responsibility                                                                      |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `src/App.tsx`, `src/app/`                            | Providers, configuration, session-dependent screen selection                        |
| `src/features/auth/`                                 | Landing/login screen, login/logout, optional session inspector                      |
| `src/features/dashboard/`                            | Signed-in shell with tab bar, Overview tab, query refresh, expiry updates           |
| `src/features/profile/`, `scores/`, `subscriptions/` | Account tab, protected history, Billing tab with subscription/purchase behavior     |
| `src/components/`                                    | Brand elements, badges, Lucide-based icons, shared screen pieces                    |
| `src/api/`                                           | Typed Axios/Zod client, account queries, session cache, native focus/network events |
| `src/components/ui/`                                 | Locally owned Gluestack/NativeWind components and fixed light theme matching Web    |

API schemas live in [HTTP contracts](../../packages/api-contracts/README.md).
Profile, subscription overview, and score history use TanStack Query hooks over
the typed API client. Each API/Auth0 identity gets its own in-memory QueryClient;
logout cancels requests and clears it. Nothing is persisted, and SDK credentials
remain the token source. Decoded session claims are only a developer display.

Profile/history stay fresh for 30 seconds; subscription overview is always stale
and refreshes on foreground/reconnect. `expo-network` supplies connection events
and requires a rebuilt native development app when first added. Transient read
failures retry at most twice; authentication, permissions, and invalid responses
do not retry. Manual refresh and verified Apple completion invalidate all three
account queries. Inactive queries refetch when enabled again.

The backend-relative Premium expiry timer uses the snapshot's original fetch
time, so cache reads cannot extend access. At expiry, old access/history are
hidden until the backend confirms the current state, including while offline.
StoreKit synchronization/polling stays in the purchase feature; its listener
stays mounted during dashboard refreshes and tab changes.

Within `src/features/subscriptions/`, `apple/` and `google/` each own their
store UI, purchase hook, and local reducer. Hooks handle native/API effects;
reducers group UI changes into named transitions. Shared subscription display
and purchase eligibility remain in the parent folder.

Failures show a short summary and, below it, a selectable **Details** line built
by `src/api/failure-details.ts`: the error code, HTTP status, requested URL, and
the backend's error code and request ID, or the store's own code and message
(for example `item-unavailable`). It reads named fields only and masks
token-like strings, so a workshop screenshot does not leak credentials. When
Google Play returns no usable offer, the Subscribe button says why: unknown
product ID, missing base plan, or more than one offer.

The Account tab ends with a **This device** panel (`DeviceInfoCard`). It lists
what the installed native app reports through `expo-application` and
`expo-device`: bundle ID or package name, app version and build, OS version, device
model, and React Native version. It also shows the API URL and the Auth0 callback
URL this build expects. Compare the last one with Auth0's allowed URLs when
sign-in fails with a callback mismatch. Both packages are native modules, so
rebuild the development app once after pulling this change.

## Manual checks

- Sign in as A, refresh/restart, and confirm stable identity; sign in as B and
  confirm separate records. Sign-out hides account data; failures stay visible.
- Start a refresh and sign out before it completes; sign in as B and confirm no
  cached data from A appears. Cancel logout and confirm A's data reloads.
- Background/foreground the app and disconnect/reconnect networking; verify
  subscription refresh, bounded retries, and an explicit offline message on an
  uncached load. Dashboard refresh must also refresh an already visible history.
- Free shows no fabricated score history. Premium loads protected scores.
  Expiry/refresh hides stale data; network failures show retry instead of Free.
- Let Premium expire while offline; cached Premium/history must disappear. After
  reconnecting or a verified Sandbox purchase, confirm access/history reload.
- Billing shows active grants as access sources; Subscription history includes
  previous records. Switch tabs and expand history rows, including on a narrow device.
- Developer tools start collapsed. Session details clear on background/sign-out;
  raw tokens are revealed only on demand and must not appear in logs/screenshots.
- Open Account → **This device** on iOS and Android: the bundle ID or package
  name must equal `IOS_BUNDLE_IDENTIFIER` / `ANDROID_PACKAGE_NAME`, the OS and
  model must match the phone, and no row may show `unknown`.
- Break one setting on purpose (a wrong `EXPO_PUBLIC_API_URL`, a stopped API, an
  unknown Google product ID) and confirm that the screen names the cause in its
  **Details** line instead of a generic retry message.
- Follow [payment scenarios](../../docs/PAYMENTS.md#manual-checks) and the separate
  [Apple device checks](../../docs/APPLE_PURCHASES.md#manual-device-checks).

`pnpm check` exports iOS and Android JavaScript; it does not prove native build, rendering,
or device purchases. Record those results separately in [TASKS](../../docs/TASKS.md).

## Cleanup

Stop Metro with `Ctrl+C`; sign out before removing the development app if retiring
it. App removal does not cancel subscriptions. Follow [Apple cleanup](../../docs/APPLE_PURCHASES.md#cleanup)
and the shared [environment cleanup](../../docs/DEVELOPMENT.md#cleanup).
