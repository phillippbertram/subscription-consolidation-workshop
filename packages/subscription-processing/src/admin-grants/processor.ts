import type { AdminGrant } from '@premiumpass/domain';
import { ProcessingError, RevisionConflict } from '../processing/contracts.js';
import {
  adminGrantRequestSchema,
  adminGrantAuditSchema,
  type AdminGrantRequest,
  type AdminGrantStore,
} from './contracts.js';

/**
 * Apply an authorized admin command through the shared access transaction.
 * The caller supplies a trusted actor and stable request ID. This is not an
 * authorization boundary: each executable must authorize its own administration path.
 * Durable receipts prevent a retry from restoring a grant revoked by a later command.
 */
export async function changeAdminGrant(
  store: AdminGrantStore,
  input: AdminGrantRequest,
  options: { dryRun?: boolean } = {},
  clock: () => Date = () => new Date(),
) {
  const request = adminGrantRequestSchema.parse(input);
  const { requestId, userId, action } = request;
  if (action === 'revoke' && request.expiresAt !== null) {
    throw new Error('Revocation does not accept an expiry.');
  }

  async function receipt() {
    const recorded = await store.receipt(userId, requestId);
    if (!recorded) {
      return null;
    }

    if (
      recorded.requestId !== requestId ||
      JSON.stringify(adminGrantRequestSchema.parse(recorded)) !==
        JSON.stringify(request)
    ) {
      throw new Error(
        'Request ID already used with different arguments or actor.',
      );
    }

    return { ...recorded, outcome: 'duplicate' as const };
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    // Load the aggregate before checking the receipt: concurrent commands are
    // either already recorded here or invalidate our later revision condition.
    const aggregate = await store.load(userId);
    const duplicate = await receipt();
    if (duplicate) {
      return duplicate;
    }

    const now = clock();
    if (
      action === 'grant' &&
      request.expiresAt &&
      Date.parse(request.expiresAt) <= now.getTime()
    ) {
      throw new ProcessingError('admin_grant_expiry_not_future');
    }

    const previous = aggregate.adminGrant;
    const changed =
      action === 'grant'
        ? !previous ||
          previous.state !== 'active' ||
          previous.expiresAt !== request.expiresAt
        : previous !== null && previous.state !== 'revoked';
    const next: AdminGrant | null = changed
      ? {
          userId,
          grantId: 'premium',
          state: action === 'grant' ? 'active' : 'revoked',
          expiresAt:
            action === 'grant' ? request.expiresAt : previous!.expiresAt,
          revision: (previous?.revision ?? 0) + 1,
          createdAt: previous?.createdAt ?? now.toISOString(),
          updatedAt: now.toISOString(),
        }
      : previous;
    const audit = adminGrantAuditSchema.parse({
      ...request,
      requestId,
      aggregateRevision: aggregate.revision + 1,
      at: now.toISOString(),
      outcome: changed ? 'changed' : 'unchanged',
      before: previous,
      after: next,
    });
    if (options.dryRun) {
      return { ...audit, outcome: 'preview' as const };
    }

    try {
      await store.commit(aggregate, audit, now);
      return audit;
    } catch (error) {
      // A lost response can hide a successful commit. Reading our durable
      // receipt prevents retries from restoring access after a later revocation.
      const completed = await receipt();
      if (completed) {
        return completed;
      }

      if (!(error instanceof RevisionConflict) || attempt === 4) {
        throw error;
      }
    }
  }

  throw new Error(
    'Premium update could not complete. Retry with the same request ID.',
  );
}
