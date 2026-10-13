import { readFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { createPrivateKey } from 'node:crypto';
import fetch from 'node-fetch';
import { z } from 'zod';
import {
  AppStoreServerAPIClient,
  Environment,
  SignedDataVerifier,
} from '@apple/app-store-server-library';
import { appleRootCertificates } from './roots.js';

export {
  Environment,
  Status,
  Type,
  AutoRenewStatus,
  InAppOwnershipType,
  VerificationException,
  VerificationStatus,
} from '@apple/app-store-server-library';
export type {
  JWSTransactionDecodedPayload,
  JWSRenewalInfoDecodedPayload,
} from '@apple/app-store-server-library';

const settingsSchema = z.object({
  bundleId: z.string().regex(/^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/),
  productId: z.string().regex(/^[A-Za-z0-9._-]{1,255}$/),
});
export type AppleSettings = z.infer<typeof settingsSchema>;

export function readAppleSettings(
  env: NodeJS.ProcessEnv,
): AppleSettings | undefined {
  if (!env.APPLE_ENABLED || env.APPLE_ENABLED === 'false') return undefined;
  if (env.APPLE_ENABLED !== 'true')
    throw new Error('APPLE_ENABLED must be true or false.');
  const result = settingsSchema.safeParse({
    bundleId: env.APPLE_BUNDLE_ID,
    productId: env.APPLE_PRODUCT_ID,
  });
  if (!result.success)
    throw new Error('Configure APPLE_BUNDLE_ID and APPLE_PRODUCT_ID.');
  return result.data;
}

export function createAppleVerifier(settings: AppleSettings) {
  // Fixed sandbox environment and trusted Apple roots; never trust client roots.
  return new SignedDataVerifier(
    appleRootCertificates,
    true,
    Environment.SANDBOX,
    settings.bundleId,
  );
}
export type AppleVerifier = ReturnType<typeof createAppleVerifier>;

class SandboxClient extends AppStoreServerAPIClient {
  protected override makeFetchRequest(
    path: string,
    query: URLSearchParams,
    method: string,
    body: string | Buffer | undefined,
    headers: Record<string, string>,
  ) {
    // The SDK exposes the transport so request/body waits can be bounded.
    return fetch(
      `https://api.storekit-sandbox.itunes.apple.com${path}?${query.toString()}`,
      {
        method,
        body,
        headers,
        timeout: 8_000,
        size: 2 * 1024 * 1024,
      },
    );
  }
}

export function createAppleClient(
  settings: AppleSettings,
  env: NodeJS.ProcessEnv,
) {
  const keyId = z
    .string()
    .regex(/^[A-Z0-9]{10}$/)
    .safeParse(env.APPLE_IAP_KEY_ID);
  const issuerId = z.uuid().safeParse(env.APPLE_IAP_ISSUER_ID);
  const path = env.APPLE_IAP_PRIVATE_KEY_PATH;
  if (!keyId.success || !issuerId.success || !path || !isAbsolute(path))
    throw new Error(
      'Configure APPLE_IAP_KEY_ID, APPLE_IAP_ISSUER_ID and an absolute APPLE_IAP_PRIVATE_KEY_PATH in services/subscription-worker/.env.',
    );
  let key: string;
  try {
    key = readFileSync(path, 'utf8');
    const parsed = createPrivateKey(key);
    if (
      parsed.asymmetricKeyType !== 'ec' ||
      parsed.asymmetricKeyDetails?.namedCurve !== 'prime256v1'
    )
      throw new Error();
  } catch {
    throw new Error(
      'APPLE_IAP_PRIVATE_KEY_PATH must point to a readable Apple P-256 .p8 private key.',
    );
  }
  return new SandboxClient(
    key,
    keyId.data,
    issuerId.data,
    settings.bundleId,
    Environment.SANDBOX,
  );
}
export type AppleClient = Pick<
  AppStoreServerAPIClient,
  'getTransactionInfo' | 'getAllSubscriptionStatuses'
>;
