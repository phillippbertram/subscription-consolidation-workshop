import {
  LOCAL_DATABASE_CONFIG,
  type DatabaseConfig,
} from '@premiumpass/persistence';

/** Below this length the API starts anyway, but logs a hint. */
export const SHORT_ADMIN_SECRET = 16;

export const shortAdminSecretHint =
  'ADMIN_SECRET is short. Fine on a loopback-only API; while the API listens on the LAN (pnpm dev:api:lan), anyone there can guess it. Generate a long one with: openssl rand -base64 32';

export interface AdminConfig {
  secret: string;
  /** A simple passphrase is allowed for local demos; the API only warns. */
  short: boolean;
}

/**
 * The admin routes exist only in the local server and only when an operator
 * has set ADMIN_SECRET by hand. Missing means disabled: there is no default
 * secret, so a fresh checkout never exposes administration by accident.
 */
export function readAdminConfig(
  env: NodeJS.ProcessEnv,
  database: DatabaseConfig,
): AdminConfig | null {
  const secret = env.ADMIN_SECRET;
  if (secret === undefined || secret === '') {
    return null;
  }

  // Surrounding spaces are almost always a copy mistake, and the browser
  // field would not send the same value back.
  if (secret.trim() !== secret) {
    throw new Error('ADMIN_SECRET must not start or end with whitespace.');
  }

  // The console reads the whole table and writes grants. Keep it on the fixed
  // Compose database, like the CLI, so a changed endpoint can never aim it at AWS.
  if (
    database.endpoint !== LOCAL_DATABASE_CONFIG.endpoint ||
    database.tableName !== LOCAL_DATABASE_CONFIG.tableName
  ) {
    throw new Error(
      `ADMIN_SECRET enables local admin routes, which require ${LOCAL_DATABASE_CONFIG.tableName} at ${LOCAL_DATABASE_CONFIG.endpoint}.`,
    );
  }

  return { secret, short: secret.length < SHORT_ADMIN_SECRET };
}
