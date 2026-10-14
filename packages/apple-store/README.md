# Apple Store

Shared Sandbox configuration, App Store Server API client, and JWS verification
using Apple's official library and public trust anchors. `src/index.ts` owns
configuration/client factories; `src/roots.ts` records certificate sources from
[Apple PKI](https://www.apple.com/certificateauthority/).

The worker loads local `.p8` credentials or a cloud secret and passes them into
`createAppleClient`. `createAppleVerifier` needs only bundle configuration and
public roots, with online certificate checks. Requests have an eight-second
transport timeout and bounded response size. No production or mock fallback.

[Local and AWS setup](../../docs/APPLE_PURCHASES.md).
