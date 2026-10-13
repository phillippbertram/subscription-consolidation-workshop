import type { Subscription } from './subscriptions.js';

/** Subscription read boundary; callers evaluate access using the current time. */
export interface SubscriptionStore {
  /**
   * Return all validated records owned by this internal user across providers,
   * including expired or unmapped subscriptions. Empty means no records;
   * malformed data, ownership mismatches and storage failures must throw.
   */
  listForUser(userId: string): Promise<Subscription[]>;
}
