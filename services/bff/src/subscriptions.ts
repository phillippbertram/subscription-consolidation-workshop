import type { Subscription } from './domain/subscriptions.js';

export interface SubscriptionStore {
  listForUser(userId: string): Promise<Subscription[]>;
}
