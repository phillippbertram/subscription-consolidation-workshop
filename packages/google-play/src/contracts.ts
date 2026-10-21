import { createHash } from 'node:crypto';
import { z } from 'zod';

export const packageNameSchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/);
export const purchaseTokenSchema = z.string().min(1).max(4096).regex(/^\S+$/);

export class GooglePlayError extends Error {
  // `detail` tells a developer what to fix. It names settings, never values.
  constructor(
    readonly code: string,
    detail?: string,
  ) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'GooglePlayError';
  }
}

/**
 * Turn failed schema fields into the environment variables to fix. A bare
 * "configuration invalid" sends people searching through every setting, and the
 * values (URLs, identifiers) have no place in an error message.
 */
export function describeInvalidSettings(
  issues: readonly { path: readonly PropertyKey[] }[],
  variableNames: Record<string, string>,
) {
  const fields = new Set(issues.map((issue) => String(issue.path[0])));
  return `fix ${[...fields].map((field) => variableNames[field] ?? field).join(', ')}`;
}

export interface GoogleSettings {
  packageName: string;
  productId: string;
  basePlanId: string;
}

export function readGoogleSettings(
  env: NodeJS.ProcessEnv,
): GoogleSettings | undefined {
  if (!env.GOOGLE_PLAY_ENABLED || env.GOOGLE_PLAY_ENABLED === 'false') {
    return undefined;
  }

  if (env.GOOGLE_PLAY_ENABLED !== 'true') {
    throw new GooglePlayError(
      'google_configuration_invalid',
      'GOOGLE_PLAY_ENABLED must be true or false',
    );
  }

  const parsed = z
    .object({
      packageName: packageNameSchema,
      productId: z.string().regex(/^[a-z0-9][a-z0-9_.]{0,39}$/),
      basePlanId: z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/),
    })
    .safeParse({
      packageName: env.GOOGLE_PLAY_PACKAGE_NAME,
      productId: env.GOOGLE_PLAY_PRODUCT_ID,
      basePlanId: env.GOOGLE_PLAY_BASE_PLAN_ID,
    });
  if (!parsed.success) {
    throw new GooglePlayError(
      'google_configuration_invalid',
      describeInvalidSettings(parsed.error.issues, {
        packageName:
          'GOOGLE_PLAY_PACKAGE_NAME (for example com.yourcompany.app)',
        productId:
          'GOOGLE_PLAY_PRODUCT_ID (lowercase, for example premium_monthly)',
        basePlanId: 'GOOGLE_PLAY_BASE_PLAN_ID (lowercase, for example monthly)',
      }),
    );
  }

  return parsed.data;
}

// Public subscription IDs and log fields use a digest, never a bearer purchase token.
export function googleSubscriptionId(
  settings: Pick<GoogleSettings, 'packageName'>,
  token: string,
) {
  return `${settings.packageName}:${createHash('sha256').update(purchaseTokenSchema.parse(token)).digest('hex')}`;
}
