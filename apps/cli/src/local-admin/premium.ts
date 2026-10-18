import { randomUUID } from 'node:crypto';
import { userInfo } from 'node:os';
import { z } from 'zod';
import { ProcessingError } from '@premiumpass/subscription-processing/contracts';
import {
  changeAdminGrant,
  DynamoDbAdminGrantStore,
} from '@premiumpass/subscription-processing/admin-grants';
import type { LocalSubscriptionStore } from './store.js';

export interface PremiumOptions {
  reason: string;
  until?: string;
  forever?: boolean;
  requestId?: string;
  dryRun?: boolean;
}

/** The local CLI trusts OS access; callers cannot supply their own actor label. */
export async function changePremium(
  local: LocalSubscriptionStore,
  userId: string,
  action: 'grant' | 'revoke',
  options: PremiumOptions,
  clock: () => Date = () => new Date(),
) {
  if (
    action === 'grant' &&
    Boolean(options.until) === Boolean(options.forever)
  ) {
    throw new Error(
      'Choose exactly one of --until <UTC timestamp> or --forever.',
    );
  }

  if (action === 'revoke' && (options.until || options.forever)) {
    throw new Error('Revocation does not accept an expiry.');
  }

  const requestId = z.uuid().parse(options.requestId ?? randomUUID());
  const actor = `local-os:${userInfo().username}`;
  console.info(
    `Premium request ID: ${requestId}${options.dryRun ? ' (preview)' : ''}`,
  );
  try {
    return await changeAdminGrant(
      new DynamoDbAdminGrantStore(local.store),
      {
        requestId,
        userId,
        action,
        actor,
        reason: options.reason,
        expiresAt: options.until ?? null,
      },
      { dryRun: Boolean(options.dryRun) },
      clock,
    );
  } catch (error) {
    if (error instanceof ProcessingError) {
      if (error.code === 'admin_grant_user_not_found') {
        throw new Error(
          'Local user not found. Sign in against the local API first.',
          { cause: error },
        );
      }

      if (error.code === 'admin_grant_expiry_not_future') {
        throw new Error('--until must be in the future.', { cause: error });
      }
    }

    throw error;
  }
}

export function listPremiumAudit(
  local: LocalSubscriptionStore,
  userId: string,
) {
  return new DynamoDbAdminGrantStore(local.store).listAudit(userId);
}
