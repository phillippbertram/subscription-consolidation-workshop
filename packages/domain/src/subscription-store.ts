import type { Subscription } from './subscriptions.js';
import type { AdminGrant } from './admin-grants.js';

/** Subscription and complimentary-access read boundary; callers evaluate access using the current time. */
export interface SubscriptionStore {
  /**
   * Return all validated records owned by this internal user across providers,
   * including expired or unmapped subscriptions. Empty means no records;
   * malformed data, ownership mismatches and storage failures must throw.
   */
  listForUser(userId: string): Promise<Subscription[]>;
  /** Independent complimentary access; errors must never become a silent miss. */
  getAdminGrant(userId: string): Promise<AdminGrant | null>;
}
