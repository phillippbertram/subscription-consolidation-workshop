# PremiumPass Mobile

An Expo development app for the iOS Simulator, using Auth0 Universal Login and the local Hono backend. Run commands from the repository root unless stated otherwise. Implementation and verification status live in [P04](../../docs/TASKS.md#p04-mobile-login-through-to-the-users-profile).

## Prerequisites

- The repository's pinned Node and pnpm versions, installed dependencies, Xcode with an available iOS Simulator, and CocoaPods.
- Docker Desktop and the [local DynamoDB workflow](../../infra/README.md#local-dynamodb-and-manual-requests).
- An Auth0 Native Application, the existing Custom API, and two synthetic users with `read:me` and `read:premium`; follow the [Auth0 setup guide](../../docs/AUTH0_SETUP.md#5-configure-the-native-application-for-p04).

This app uses `react-native-auth0`, so it requires a native development build. Expo Go cannot run it. Builds run locally through Xcode; no EAS account or AWS deployment is needed.

## Configure the app and backend

For initial setup only:

```sh
pnpm install --frozen-lockfile
cp apps/mobile/.env.example apps/mobile/.env
```

Preserve an existing `.env`. Set these public values:

| Variable                      | Value                                                                                             |
| ----------------------------- | ------------------------------------------------------------------------------------------------- |
| `EXPO_PUBLIC_AUTH0_DOMAIN`    | Tenant or custom domain, without `https://` or a trailing slash; must match the BFF's issuer host |
| `EXPO_PUBLIC_AUTH0_CLIENT_ID` | Client ID of the **Native** application                                                           |
| `EXPO_PUBLIC_AUTH0_AUDIENCE`  | Same Custom API identifier as the BFF's `AUTH0_AUDIENCE`                                          |
| `EXPO_PUBLIC_API_URL`         | `http://127.0.0.1:3000` for the iOS Simulator and the default BFF port                            |

Expo embeds these values in the app bundle. They are public configuration, not secret storage. Never add a client secret or token. Missing configuration or the sample domain/client ID displays a setup screen and prevents login.

The API audience stays unchanged when the backend runs locally. It identifies the API in Auth0; `EXPO_PUBLIC_API_URL` determines where the app sends HTTP requests.

In the existing `services/bff/.env`, keep your Auth0 values and set:

```dotenv
PORT=3000
DYNAMODB_TABLE_NAME=premiumpass-local
DYNAMODB_ENDPOINT=http://127.0.0.1:8000
```

Without `DYNAMODB_ENDPOINT`, the BFF uses the normal AWS credential chain rather than DynamoDB Local. Restart the BFF after changing its configuration.

The configured app scheme is `premiumpass`, and the iOS bundle identifier is `com.example.premiumpass`. Register the following exact URL in both **Allowed Callback URLs** and **Allowed Logout URLs** for the Native application, replacing the domain:

```text
premiumpass://your-tenant.eu.auth0.com/ios/com.example.premiumpass/callback
```

The callback returns to the app, not the local backend. Login uses PKCE and requests `openid profile email read:me read:premium`. No refresh token is requested for this first flow: the SDK restores still-valid credentials from secure storage; when credentials expire, sign in again. Tokens remain in SDK-managed secure storage. The dashboard can temporarily display access and ID tokens for inspection; they are never written to AsyncStorage or logs.

If Auth0 displays **Callback URL mismatch**, open the application whose Client ID is configured in `apps/mobile/.env`. Confirm its type is **Native** and add the exact callback above using your configured domain. Changing the callback allowlist requires saving the Auth0 settings and retrying login; it does not require rebuilding the app unless its domain/scheme/identifier also changes.

## Run on the iOS Simulator

Start the local database and backend in one terminal:

```sh
pnpm local:up
pnpm dev:api
```

For the full checkout workflow, use root `pnpm dev` instead of the two commands above; it includes Docker, BFF, Billing, and the website. Do not start a second BFF on the same port.

Build, install, and launch the app in another terminal:

```sh
pnpm mobile:ios
```

This generates the iOS project, installs Pods, builds through Xcode, and starts Metro. To select a specific installed simulator, pass its name, for example:

```sh
pnpm mobile:ios --device "iPhone 17 Pro"
```

After the initial build, start Metro for the installed development app with:

```sh
pnpm mobile:dev
```

Press `i` in the Metro terminal to open the iOS app. Stop Metro or the BFF with `Ctrl+C`. `pnpm local:down` stops all Compose services and preserves the DynamoDB volume; in-memory ElasticMQ messages are lost.

Reload the app after changing public JavaScript configuration. Rebuild with `pnpm mobile:ios` after changing the Auth0 domain, app scheme, bundle identifier, or native dependencies. The Auth0 domain is also embedded in native callback configuration. Generated `ios/` and `android/` directories are ignored; edit `app.config.ts` instead of generated files.

The iOS Simulator can reach the Mac's loopback address. The BFF stays bound to `127.0.0.1`. App Transport Security permits local networking through `NSAllowsLocalNetworking`; HTTPS remains required for other API origins. A physical iPhone would need separate LAN/network configuration. Android native settings are prepared by the Auth0 plugin, but Android builds and login are outside this verification scope.

## App structure

| File                                                | Responsibility                                                                               |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `app.config.ts`                                     | Expo identity, Auth0 native plugin, and local iOS networking                                 |
| `src/App.tsx`                                       | Composition root: validate configuration and mount safe-area, Gluestack, and Auth0 providers |
| `src/app/config.ts`                                 | Validate the public configuration before enabling login                                      |
| `src/app/AppContent.tsx`                            | Select session restoration, login, or profile content from Auth0 state                       |
| `src/features/auth/LoginScreen.tsx`                 | Render the signed-out screen                                                                 |
| `src/features/auth/use-auth-session.ts`             | Coordinate login/logout actions and their busy/error state                                   |
| `src/features/auth/auth-errors.ts`                  | Map known SDK failures to safe messages                                                      |
| `src/features/profile/ProfileScreen.tsx`            | Compose profile loading, errors, content, and actions                                        |
| `src/features/profile/ProfileCard.tsx`              | Present a validated profile through props                                                    |
| `src/features/profile/use-profile.ts`               | Load/reload the profile and cancel obsolete requests                                         |
| `src/api/api-client.ts`                             | Axios instance, interceptors, Zod response schemas, and safe API errors                      |
| `src/api/use-api-client.ts`                         | Connect the client to the Auth0 Credentials Manager                                          |
| `src/components/`                                   | Shared screen layout and error presentation                                                  |
| `src/components/ui/`                                | Locally owned Gluestack components and theme provider                                        |
| `tailwind.config.js`                                | Class scanning and semantic color names                                                      |
| `metro.config.js`, `babel.config.js`, `globals.css` | NativeWind transformation and Tailwind input                                                 |

### Patterns to explore

Start with `App.tsx`, follow `AppContent.tsx` into each screen, and then read its hook. Features keep their screen, specialized components, and behavior together. Shared components contain presentation; the API layer owns HTTP and response validation. Component-specific styling uses NativeWind classes beside the JSX. Semantic colors live in the Gluestack provider configuration; Tailwind supplies the spacing scale.

`useAuthSession` wraps the Auth0 SDK without copying credentials or user identity into another store. `AppContent` calls it once and passes action state to its children: custom hooks share logic, but separate calls do not share local state. Login and profile are mutually exclusive views selected by session state. A navigation library becomes useful when authenticated screens need stacks, tabs, history, or deep links.

`useProfile` represents loading, success, and failure as a discriminated union, so rendering can narrow the available data by `status`. Effect cleanup cancels the request and ignores late results. The profile screen is keyed by the authenticated identity, resetting its local state when the user changes. Profile data is hidden while logout is pending; a failed logout allows it to load again.

This small app keeps remote data in its feature hook. Add a query/cache library when multiple screens share server data or need caching and invalidation. Gluestack UI implements presentation independently of these boundaries.

Sources: [React custom hooks](https://react.dev/learn/reusing-logic-with-custom-hooks), [React Navigation authentication flows](https://reactnavigation.org/docs/auth-flow/).

### Gluestack UI and NativeWind

The app uses Gluestack Core 5.0.15 and Utils 5.0.6 with NativeWind 4.2.7 and Tailwind CSS 3.4.19. Gluestack's CLI supports this NativeWind v4 path; versions are pinned rather than mixing in the NativeWind v5 release candidate. Reanimated, Worklets, and SVG use the versions expected by Expo SDK 57.

`src/components/ui` contains selected and adapted upstream components: Button, ButtonText, ButtonSpinner, Text, Card, and Spinner. These files belong to the app and can be edited. Gluestack supplies component behavior; NativeWind translates `className` utilities into native styles. For example:

```tsx
<Button variant="outline" isDisabled={isBusy} onPress={reload}>
  <ButtonText>Reload profile</ButtonText>
</Button>
```

ButtonText inherits the button's variant through its style context. Use `isDisabled` for Gluestack buttons. Feature components compose these primitives and keep API/authentication logic in their hooks.

`GluestackUIProvider` applies the current light theme. Edit semantic RGB tokens in `src/components/ui/gluestack-ui-provider/config.ts`; `tailwind.config.js` maps them to classes such as `bg-primary` and `text-muted-foreground`. The provider is intentionally limited to the current screens; overlay/toast providers can be added when those components are introduced. Dark mode and web rendering are not part of this implementation.

After pulling this change, rebuild the native development app because new native dependencies were added:

```sh
pnpm install --frozen-lockfile
pnpm mobile:ios
```

Restart an already running Metro process after changing Babel or Metro configuration. If it retains stale transforms, use `pnpm mobile:dev --clear`. Changing ordinary component classes only needs Fast Refresh.

Sources: [Gluestack installation](https://gluestack.io/ui/docs/home/getting-started/installation), [Gluestack CLI and NativeWind v4 option](https://gluestack.io/ui/docs/home/getting-started/cli), [upstream component templates](https://github.com/gluestack/gluestack-ui/tree/6572e8745011c3a89fed4263fcb4fcd1972af04e/src/components/ui).

### API client

`ApiClient` owns a dedicated Axios instance with the configured API origin and a 15-second HTTP timeout. Its asynchronous request interceptor reads the current access token through an injected provider backed by Auth0's `getCredentials()`, then sets the Bearer header. API-consuming screens never read or pass tokens; the separate session inspector reads an on-demand display snapshot from the SDK. No token is cached in the client or saved to Axios defaults; credentials stay in the SDK's secure storage. A failed credential lookup blocks the request, and a different API origin is rejected before reading credentials.

The response interceptor converts transport and HTTP failures into `ApiError` with a safe message, a `code`, and an optional HTTP `status`. Raw Axios errors are not exposed because they contain request headers. Cancellation uses `AbortSignal`, including a check after asynchronous token retrieval. The HTTP timeout starts when Axios dispatches the network request; it does not limit the SDK credential lookup. There is no automatic retry or separate refresh-token flow in the client.

Every request receives a Zod response schema. `request()` unwraps `response.data`, validates it, and returns the inferred result type. The profile schema requires a UUID `userId` and a UTC ISO datetime `createdAt`; invalid responses become `ApiError` with code `invalid_response`. Development API logs still include the HTTP response body. These checks validate the API contract; authorization is still enforced by the backend.

Inside a component under `Auth0Provider`:

```ts
const api = useApiClient();
const profile = await api.getProfile();
// For an effect that must cancel obsolete requests:
const controller = new AbortController();
const cancellableProfile = await api.getProfile({ signal: controller.signal });
```

For another endpoint, define its response schema and use `api.get(path, schema, options)` or `api.post(path, body, schema, options)`. `api.request(method, path, schema, options)` supports the remaining HTTP methods. Options support query parameters and cancellation; callers do not configure authentication headers. Use a schema such as `z.unknown()` only when intentionally accepting an unstructured response.

`useApiClient()` reads the validated API URL from the app configuration itself. Screens and feature hooks do not pass it through props. The standalone `ApiClient` still accepts an origin and token provider explicitly.

### Debug API traffic

In development builds, `src/api/api-logger.ts` logs request and response events to the JavaScript console (React Native DevTools, opened with `j` in Metro). Each call has a matching `[API #n]` prefix, method, URL, query parameters, request body, status, elapsed milliseconds, and response body. Successful responses also include the backend's `X-Request-Id`. HTTP, network, credential, cancellation, and schema failures produce error events. A successful HTTP response can therefore be followed by an `invalid_response` error if it fails Zod validation.

Synthetic request and response bodies are logged without redaction. Headers, credentials, and raw Axios/SDK error objects are not logged. Logging is disabled when React Native's `__DEV__` flag is false. Do not use real customer or payment payloads in this learning app.

Sources: [Axios instances](https://axios-http.com/docs/instance), [Axios interceptors](https://axios-http.com/docs/interceptors), [Zod parsing and inferred types](https://zod.dev/basics).

## Manual verification

1. Start the backend and database, then launch the native app.
2. Sign in as demo user A. The app opens Universal Login and returns through its custom scheme. The profile should show the BFF's `userId` and `createdAt`.
3. Reload the profile and restart the app while the token is valid. The ID and creation timestamp should remain unchanged.
4. Stop the BFF, reload the profile, and confirm an actionable error. Restart it and retry. A stopped/misconfigured database should also produce an error rather than a fabricated profile.
5. Sign out successfully and confirm the profile disappears. Cancelling or failing logout must show an error and must not claim that the session was cleared.
6. Sign in as demo user B and confirm a different internal ID. Sign back in as A and confirm A's original ID.
7. A user without `read:me` should receive a permission error. A rejected/expired session should offer sign-out/sign-in recovery.

No automated tests or test framework are part of this project. `pnpm check` includes mobile typechecking, linting, formatting, and an iOS JavaScript export; the export does not prove a native build or successful login. `pnpm --filter @premiumpass/mobile exec expo install --check` checks Expo dependency compatibility. Native configuration can be regenerated separately using `pnpm --filter @premiumpass/mobile prebuild:ios`.

Sources: [Auth0 Expo quickstart](https://auth0.com/docs/quickstart/native/react-native-expo), [Auth0 SDK](https://github.com/auth0/react-native-auth0), [Expo monorepos](https://docs.expo.dev/guides/monorepos/).


## Subscription dashboard

The profile screen composes `ProfileCard` and the feature-owned `subscriptions/PremiumCard`. `useProfile` loads the profile and entitlements together, refreshes when the app returns to the foreground, and reloads at the next access boundary. Reloading unmounts the history card, cancels pending requests, and removes previous history. A failed refresh displays an error instead of retaining a Premium badge. The server remains authoritative even if the app is offline or its timer is suspended.

`ApiClient.getEntitlements()` and `getScoreHistory()` validate responses with Zod. History is requested explicitly so you can observe both a successful Premium response and a Free user's `403 premium_required`. A missing `read:premium` scope instead produces a permissions error. Sign out and sign in after configuring the new scope.

Follow the [P05 scenario guide](../../docs/PAYMENTS.md#manual-checks) to switch local data between Free, Premium, grace, and expiration. All scores are synthetic. Real purchases and store adapters follow in later tasks.


## Auth0 session inspector

The dashboard's **Auth0 session** card shows the SDK user's name and email. Open **Show session details** for:

- The OIDC profile exposed by `useAuth0().user`, including available standard and custom profile claims. The SDK uses camelCase names such as `emailVerified`; the ID-token view retains original claim names.
- Credential metadata from `getCredentials()`: token type, granted scopes, access-token expiry, optional session expiry, and whether a refresh token exists.
- Separate expandable access-token and ID-token sections, each with decoded JWT header and claims. **Show raw access token** / **Show raw ID token** reveals selectable original token text.

The SDK remains responsible for credentials. `useSessionDetails` obtains a temporary snapshot when the panel opens or **Reload session details** is pressed; it does not force renewal or serve tokens to the API client. Closing the panel, starting sign-out, changing users, or leaving the foreground discards the inspector view. SDK failures show a message without logging credentials. Refresh-token values are not copied into the view.

[Auth0's jwt-decode](https://github.com/auth0/jwt-decode) handles JWT decoding, including Unicode. Decoding is only for display, not signature verification or authorization. Opaque or malformed tokens show a fallback message. The backend still validates API access independently. The inspector uses the existing SDK profile; it does not fetch a separate `/userinfo` response or the Auth0 browser's session cookies.

Manual flow: open the panel, compare profile fields with ID-token claims, inspect access-token audience/scopes/expiry, reveal and hide a raw token, reload the snapshot, and close/reopen the panel. Backgrounding the app closes the details. Sign-out removes the card with the rest of the authenticated dashboard.
