# Setup

Set up the whole lab once: first locally with Auth0 and Stripe, then, if you
want, the iOS and Android apps with real store test purchases, and a deployment
to AWS. Every account runs in test or sandbox mode with synthetic users; nothing
here takes real payments. Every page has the same shape: what works afterwards,
what you need, numbered steps with a check, and how to remove it again.

## Prior knowledge

Experience with app and cloud development. You should be comfortable with
TypeScript, a web or React Native app, HTTP APIs, and basic cloud concepts such
as functions, queues, and permissions. These docs explain subscriptions and
their pitfalls, not these fundamentals.

## Order

| Step                                 | What works afterwards                                                  | Tools                                                                           | Accounts                                            |
| ------------------------------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------- |
| 1. [Workspace](workspace.md)         | Dependencies installed, Docker running, `config/.env` created          | Node and pnpm (pinned in `.nvmrc` and `package.json`), Docker                   | —                                                   |
| 2. [Auth0](auth0.md)                 | Two synthetic users can sign in                                        | —                                                                               | Auth0 tenant (free)                                 |
| 3. [Stripe](stripe.md)               | A test purchase on the website grants Premium                          | Stripe CLI                                                                      | Stripe sandbox                                      |
| 4. [Apple + iOS app](apple.md)       | The app on the Simulator or an iPhone; Sandbox purchases on the iPhone | Mac with Xcode and CocoaPods; for purchases a physical iPhone and ngrok         | Apple Developer Program membership for purchases    |
| 5. [Google + Android app](google.md) | The Android app with license-test purchases                            | Android Studio with its JDK and SDK, an Android device or Play-enabled emulator | Google Play developer account, Google Cloud project |
| 6. [AWS](aws.md)                     | The backend in your own development account                            | AWS CLI v2                                                                      | AWS account for development                         |

Steps 1–3 are the local path and run on one computer. After them, test the
running system with [Try it out](../try-it/README.md). Steps 4–6 are optional
and independent of each other.

## Accounts

The local path needs only Auth0 and Stripe. The other accounts are needed only
to test against the real stores or AWS.

| Account                                                                     | What you set up there                                                                       | Needed for                                 |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------ |
| [Auth0](https://auth0.com/) tenant (free)                                   | API, applications, and synthetic test users                                                 | Always                                     |
| [Stripe](https://stripe.com/) account with a sandbox                        | Premium product, prices, and test API keys; no real payments                                | Always                                     |
| [AWS](https://aws.amazon.com/) account for development                      | CDK deployment of the backend; creates billable resources                                   | Testing in AWS ([guide](aws.md))           |
| [Apple Developer Program](https://developer.apple.com/programs/) membership | A demo app with your bundle ID, the subscription, and a Sandbox tester in App Store Connect | Apple purchases ([guide](apple.md))        |
| [Google Play developer account](https://play.google.com/console/)           | A demo app with your package name, the subscription, license testers, and a test release    | Google Play purchases ([guide](google.md)) |

Both stores only offer subscriptions for an app registered in your developer
account, so you create your own demo app there first. Store accounts cost a
registration fee and their verification can take days: register early. Apple
purchases also need a Mac with Xcode and a physical iPhone; Google Play
purchases need Android Studio and a device or Play-enabled emulator.

## After the setup

- Test the running system: [Try it out](../try-it/README.md) has six scenarios,
  each with the result you should see.
- Explore [concepts](../CONCEPTS.md), [architecture](../ARCHITECTURE.md), or
  [local development](../DEVELOPMENT.md).
- Finish with [Cleanup](../DEVELOPMENT.md#cleanup): pause processes, reset local
  data, or remove the project-specific integrations.
