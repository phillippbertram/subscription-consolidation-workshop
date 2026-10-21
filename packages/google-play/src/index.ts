import { readFileSync } from 'node:fs';
import { JWT, OAuth2Client } from 'google-auth-library';
import { z } from 'zod';

export {
  packageNameSchema,
  purchaseTokenSchema,
  GooglePlayError,
  readGoogleSettings,
  googleSubscriptionId,
  type GoogleSettings,
} from './contracts.js';
import {
  purchaseTokenSchema,
  GooglePlayError,
  describeInvalidSettings,
  type GoogleSettings,
} from './contracts.js';

export const googlePurchaseSchema = z.object({
  subscriptionState: z.enum([
    'SUBSCRIPTION_STATE_PENDING',
    'SUBSCRIPTION_STATE_ACTIVE',
    'SUBSCRIPTION_STATE_PAUSED',
    'SUBSCRIPTION_STATE_IN_GRACE_PERIOD',
    'SUBSCRIPTION_STATE_ON_HOLD',
    'SUBSCRIPTION_STATE_CANCELED',
    'SUBSCRIPTION_STATE_EXPIRED',
    'SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED',
  ]),
  testPurchase: z.object({}),
  acknowledgementState: z.enum([
    'ACKNOWLEDGEMENT_STATE_PENDING',
    'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
  ]),
  externalAccountIdentifiers: z.object({
    obfuscatedExternalAccountId: z.uuid(),
  }),
  linkedPurchaseToken: purchaseTokenSchema.optional(),
  lineItems: z
    .array(
      z.object({
        productId: z.string(),
        expiryTime: z.iso.datetime({ offset: true }).optional(),
        autoRenewingPlan: z.object({ autoRenewEnabled: z.boolean() }),
        offerDetails: z.object({
          basePlanId: z.string(),
          offerId: z.string().optional(),
        }),
        // The Play Console order (GPA.…) of the latest successful purchase or
        // renewal. Logged only, so a log line matches an entry in Order
        // management; it never decides access. Absent until the user owns it.
        latestSuccessfulOrderId: z.string().optional(),
      }),
    )
    .length(1),
});
export type GooglePurchase = z.infer<typeof googlePurchaseSchema>;
export interface GoogleClient {
  get(token: string): Promise<unknown>;
  acknowledge(token: string): Promise<void>;
}

const googleCredentialsSchema = z.object({
  type: z.literal('service_account'),
  client_email: z.email(),
  private_key: z.string().startsWith('-----BEGIN PRIVATE KEY-----'),
});
export type GoogleCredentials = z.infer<typeof googleCredentialsSchema>;

/** Accept only the service-account fields used by our fixed-endpoint client. */
export function parseGoogleCredentials(value: unknown): GoogleCredentials {
  const result = googleCredentialsSchema.safeParse(value);
  if (!result.success) {
    throw new GooglePlayError('google_credentials_invalid');
  }

  return result.data;
}

/** Explicit local file credentials; never fall back to ADC or another project. */
export function createGoogleClient(
  settings: GoogleSettings,
  env: NodeJS.ProcessEnv,
): GoogleClient {
  let credentials: GoogleCredentials;
  try {
    credentials = parseGoogleCredentials(
      JSON.parse(
        readFileSync(env.GOOGLE_PLAY_SERVICE_ACCOUNT_FILE ?? '', 'utf8'),
      ) as unknown,
    );
  } catch {
    throw new GooglePlayError('google_credentials_invalid');
  }

  return createGoogleClientFromCredentials(settings, credentials);
}

/** Cloud callers pass validated Secrets Manager data, never a temporary key file. */
export function createGoogleClientFromCredentials(
  settings: GoogleSettings,
  value: GoogleCredentials,
): GoogleClient {
  const credentials = parseGoogleCredentials(value);
  const auth = new JWT({
    transporterOptions: { timeout: 5000, retry: false },
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ['https://www.googleapis.com/auth/androidpublisher'],
  });
  const prefix = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(settings.packageName)}/purchases`;
  return {
    async get(token) {
      try {
        return (
          await auth.request<unknown>({
            url: `${prefix}/subscriptionsv2/tokens/${encodeURIComponent(purchaseTokenSchema.parse(token))}`,
            timeout: 5000,
            retry: false,
          })
        ).data;
      } catch {
        // Gaxios errors include credential headers and token-bearing URLs.
        throw new GooglePlayError('google_provider_unavailable');
      }
    },
    async acknowledge(token) {
      try {
        await auth.request({
          method: 'POST',
          url: `${prefix}/subscriptions/${encodeURIComponent(settings.productId)}/tokens/${encodeURIComponent(purchaseTokenSchema.parse(token))}:acknowledge`,
          data: {},
          timeout: 5000,
          retry: false,
        });
      } catch {
        throw new GooglePlayError('google_acknowledgement_unavailable');
      }
    },
  };
}

export async function readGooglePurchase(
  client: GoogleClient,
  settings: GoogleSettings,
  token: string,
) {
  const parsed = googlePurchaseSchema.safeParse(await client.get(token));
  if (!parsed.success) {
    // In particular, missing testPurchase must never enable production purchases.
    throw new GooglePlayError('google_purchase_invalid_or_not_test');
  }

  const purchase = parsed.data;
  const line = purchase.lineItems[0]!;
  if (
    line.productId !== settings.productId ||
    line.offerDetails.basePlanId !== settings.basePlanId ||
    line.offerDetails.offerId
  ) {
    throw new GooglePlayError('google_product_or_plan_mismatch');
  }

  if (
    !line.expiryTime &&
    ![
      'SUBSCRIPTION_STATE_PENDING',
      'SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED',
    ].includes(purchase.subscriptionState)
  ) {
    throw new GooglePlayError('google_expiry_missing');
  }

  return purchase;
}

export interface GooglePushSettings {
  audience: string;
  serviceAccountEmail: string;
  subscription: string;
}
export function readGooglePushSettings(
  env: NodeJS.ProcessEnv,
): GooglePushSettings {
  const parsed = z
    .object({
      audience: z.url().refine((value) => new URL(value).protocol === 'https:'),
      serviceAccountEmail: z.email(),
      subscription: z.string().regex(/^projects\/[^/]+\/subscriptions\/[^/]+$/),
    })
    .safeParse({
      audience: env.GOOGLE_PLAY_PUSH_AUDIENCE,
      serviceAccountEmail: env.GOOGLE_PLAY_PUSH_SERVICE_ACCOUNT_EMAIL,
      subscription: env.GOOGLE_PLAY_PUSH_SUBSCRIPTION,
    });
  if (!parsed.success) {
    console.error(parsed.error.message);
    throw new GooglePlayError(
      'google_push_configuration_invalid',
      describeInvalidSettings(parsed.error.issues, {
        audience: 'GOOGLE_PLAY_PUSH_AUDIENCE (an HTTPS URL)',
        serviceAccountEmail:
          'GOOGLE_PLAY_PUSH_SERVICE_ACCOUNT_EMAIL (an email address)',
        subscription:
          'GOOGLE_PLAY_PUSH_SUBSCRIPTION (the full name projects/<project-id>/subscriptions/<subscription-id>, not just the ID)',
      }),
    );
  }

  return parsed.data;
}

export function createGooglePushVerifier(settings: GooglePushSettings) {
  const auth = new OAuth2Client({
    transporterOptions: { timeout: 5000, retry: false },
  });
  return async (token: string) => {
    const ticket = await auth.verifyIdToken({
      idToken: token,
      audience: settings.audience,
    });
    const claims = ticket.getPayload();
    if (
      claims?.email !== settings.serviceAccountEmail ||
      claims.email_verified !== true
    ) {
      throw new GooglePlayError('google_push_identity_invalid');
    }
  };
}
