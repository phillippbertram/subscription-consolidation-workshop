# PremiumPass Mobile

An Expo development app with Auth0 login, synthetic score history, and shared
subscription access. To configure, run, and check it on the iOS Simulator or an
iPhone, follow [Apple + iOS app](../../docs/setup/apple.md). For Android, follow
[Google Play preparation](../../docs/setup/google.md). This guide describes how
the app is built.

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
