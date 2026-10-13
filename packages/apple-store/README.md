# Apple Store

Shared sandbox-only configuration, App Store Server API client, and JWS verifier for the subscription worker and Apple notification ingress. Uses Apple's official Node library with fixed Apple trust anchors and online certificate-status checks. The API client has an eight-second per-request timeout and a bounded response size.

`createAppleClient` reads an absolute `.p8` path only in the worker. `createAppleVerifier` needs only the app bundle ID and the public certificates. No production, Xcode-simulation, or mock fallback is supported. See [setup](../../docs/APPLE_PURCHASES.md).

Public trust anchors were obtained from [Apple PKI](https://www.apple.com/certificateauthority/); source URLs are retained beside their DER values in `src/roots.ts`.
