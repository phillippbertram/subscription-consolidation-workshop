import type {
  AdminUser,
  SubscriptionEvaluation,
} from '@premiumpass/api-contracts/admin';
import { formatDateTime } from '@/lib/format';

/** One line for the access column, e.g. "until 2 Nov 2026 · 2 grants". */
export function accessSummary(user: AdminUser) {
  const { access } = user;
  if (access.tier === 'free') {
    return 'no valid grant';
  }

  const unbounded = access.grants.some((grant) => grant.validUntil === null);
  const grants = `${access.grants.length} grant${access.grants.length === 1 ? '' : 's'}`;
  if (unbounded) {
    return `until revoked · ${grants}`;
  }

  return `until ${formatDateTime(access.effectiveUntil)} · ${grants}`;
}

export function evaluationText(evaluation: SubscriptionEvaluation) {
  switch (evaluation.result) {
    case 'grants':
      return `Counts until ${formatDateTime(evaluation.until)}`;
    case 'ended':
      return `Ended ${formatDateTime(evaluation.until)}`;
    case 'warning':
      return `Grants nothing: ${evaluation.reason ?? 'unknown data'}`;
    case 'none':
      return evaluation.reason ?? 'Grants nothing';
  }
}
