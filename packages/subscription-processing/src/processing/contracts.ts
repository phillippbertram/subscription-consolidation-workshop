import type { Subscription, AdminGrant } from '@premiumpass/domain';

/**
 * One user's subscriptions across providers plus the revision guarding writes.
 * Reads are not an atomic snapshot; the commit must reject an outdated revision.
 */
export interface Aggregate {
  userId: string;
  /** Aggregate revision, separate from source revisions; zero means no snapshot. */
  revision: number;
  subscriptions: Subscription[];
  adminGrant: AdminGrant | null;
  /** Next persisted access boundary; source subscriptions are never extended by it. */
  effectiveUntil?: string | null;
}

export function expirationDue(aggregate: Aggregate, now: Date) {
  return Boolean(
    aggregate.effectiveUntil &&
    Date.parse(aggregate.effectiveUntil) <= now.getTime(),
  );
}

export class ProcessingError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'ProcessingError';
  }
}

export class RevisionConflict extends ProcessingError {
  constructor() {
    super('revision_conflict');
  }
}
