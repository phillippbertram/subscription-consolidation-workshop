import type { Subscription } from './subscriptions.js';

export interface SubscriptionStore {
  listForUser(userId: string): Promise<Subscription[]>;
}
