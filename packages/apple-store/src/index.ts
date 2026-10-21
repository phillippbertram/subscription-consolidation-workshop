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
  if (!env.APPLE_ENABLED || env.APPLE_ENABLED === 'false') {
    return undefined;
  }

  if (env.APPLE_ENABLED !== 'true') {
    throw new Error('APPLE_ENABLED must be true or false.');
  }

  const result = settingsSchema.safeParse({
    bundleId: env.APPLE_BUNDLE_ID,
    productId: env.APPLE_PRODUCT_ID,
  });
  if (!result.success) {
    throw new Error('Configure APPLE_BUNDLE_ID and APPLE_PRODUCT_ID.');
  }

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

const credentialsSchema = z.object({
  keyId: z.string().regex(/^[A-Z0-9]{10}$/),
  issuerId: z.uuid(),
  privateKey: z.string().min(1),
});
export type AppleCredentials = z.infer<typeof credentialsSchema>;

export function parseAppleCredentials(value: unknown): AppleCredentials {
  const result = credentialsSchema.safeParse(value);
  if (!result.success) {
    throw new Error('Invalid Apple In-App Purchase credentials.');
  }

  try {
    const key = createPrivateKey(result.data.privateKey);
    if (
      key.asymmetricKeyType !== 'ec' ||
      key.asymmetricKeyDetails?.namedCurve !== 'prime256v1'
    ) {
      throw new Error();
    }
  } catch {
    throw new Error(
      'Apple In-App Purchase credentials require a P-256 private key.',
    );
  }

  return result.data;
}

export function readLocalAppleCredentials(
  env: NodeJS.ProcessEnv,
): AppleCredentials {
  const path = env.APPLE_IAP_PRIVATE_KEY_PATH;
  if (!path || !isAbsolute(path)) {
    throw new Error(
      'Configure an absolute APPLE_IAP_PRIVATE_KEY_PATH in config/.env and run pnpm config:sync.',
    );
  }

  let privateKey: string;
  try {
    privateKey = readFileSync(path, 'utf8');
  } catch {
    throw new Error(
      'APPLE_IAP_PRIVATE_KEY_PATH must point to a readable Apple P-256 .p8 private key.',
    );
  }

  return parseAppleCredentials({
    keyId: env.APPLE_IAP_KEY_ID,
    issuerId: env.APPLE_IAP_ISSUER_ID,
    privateKey,
  });
}

export function createAppleClient(
  settings: AppleSettings,
  credentials: AppleCredentials,
) {
  return new SandboxClient(
    credentials.privateKey,
    credentials.keyId,
    credentials.issuerId,
    settings.bundleId,
    Environment.SANDBOX,
  );
}

export type AppleClient = Pick<
  AppStoreServerAPIClient,
  'getTransactionInfo' | 'getAllSubscriptionStatuses' | 'finishTransaction'
>;
