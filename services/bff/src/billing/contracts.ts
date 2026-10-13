import { z } from 'zod';

export class CheckoutError extends Error {
  constructor(
    readonly code: string,
    readonly status: 400 | 401 | 403 | 409 | 503,
  ) {
    super(code);
  }
}

export const customerSchema = z.object({
  userId: z.uuid(),
  requestId: z.uuid(),
  createdAt: z.number().int(),
  customerId: z.string().startsWith('cus_').optional(),
});
export type CustomerMapping = z.infer<typeof customerSchema>;

export const attemptSchema = z.object({
  userId: z.uuid(),
  requestId: z.uuid(),
  fingerprint: z.string(),
  customerId: z.string().startsWith('cus_'),
  priceId: z.string().startsWith('price_'),
  successUrl: z.url(),
  cancelUrl: z.url(),
  createdAt: z.number().int(),
  expiresAt: z.number().int(),
  sessionId: z.string().startsWith('cs_test_').optional(),
});
export type CheckoutAttempt = z.infer<typeof attemptSchema>;

/**
 * Durable checkout bookkeeping used by CheckoutService, without HTTP or Stripe
 * calls. Conditional writes and transactions protect ownership and purchase
 * reservations; they cannot make a Stripe call part of a database transaction.
 * Reads must observe committed reservations so retries can recover prior work.
 */
export interface BillingStore {
  /**
   * Return the user's existing mapping or conditionally create an intent with a
   * stable requestId. Concurrent callers converge on that intent; now is Unix
   * seconds, used by the service to bound recovery of an unresolved creation.
   */
  reserveCustomer(userId: string, now: number): Promise<CustomerMapping>;

  /**
   * Atomically bind the reserved intent to the customer and store its reverse
   * owner. Repeating the same binding is allowed; conflicting ownership fails.
   */
  saveCustomer(mapping: CustomerMapping, customerId: string): Promise<void>;

  /** Return the internal owner from the reverse mapping, or null if absent. */
  getCustomerOwner(customerId: string): Promise<string | null>;

  /**
   * Load the persisted purchase parameters for this user/request pair.
   * Return null for absence; malformed data or an ownership mismatch must fail.
   */
  getAttempt(
    userId: string,
    requestId: string,
  ): Promise<CheckoutAttempt | null>;

  /**
   * Read the user's purchase-lock pointer. "Active" means reserved, not paid:
   * the referenced Stripe session may already be complete or expired.
   */
  getActiveAttemptId(userId: string): Promise<string | null>;

  /**
   * Atomically create the attempt and replace the pointer only if it still
   * matches previousId (null requires no pointer). CheckoutService must first
   * verify that any previous session expired. False means a conditional conflict
   * requiring a reread; storage failures throw rather than masquerading as one.
   */
  reserveAttempt(
    attempt: CheckoutAttempt,
    previousId: string | null,
  ): Promise<boolean>;

  /**
   * Attach a session only when the attempt fingerprint still matches and its
   * sessionId is absent or identical. Never overwrite a different session.
   */
  saveSession(attempt: CheckoutAttempt, sessionId: string): Promise<void>;
}

/**
 * Validated test-mode checkout data used to resume a persisted purchase attempt.
 * The service must match customer/user/request IDs to that attempt; a complete
 * session alone does not prove a subscription entitlement.
 */
export interface CheckoutSession {
  id: string;
  customerId: string;
  userId: string;
  requestId: string;
  status: 'open' | 'complete' | 'expired';
  /** Hosted checkout URL, or null when Stripe provides no redirect target. */
  url: string | null;
  /** Provider-confirmed session expiration in Unix seconds. */
  expiresAt: number;
}

/**
 * External checkout operations, currently implemented by the Stripe test-mode
 * adapter. This boundary validates provider objects and exposes safe application
 * errors instead of raw payment payloads. It neither persists local records nor
 * grants entitlements; subscription verification belongs to the worker.
 */
export interface BillingProvider {
  /** Reject prices/products outside the supported active monthly test plan. */
  validatePrice(priceId: string): Promise<void>;

  /**
   * Create using the persisted intent's requestId as the basis for provider
   * idempotency. CheckoutService bounds retries to the supported recovery window;
   * the provider's deduplication is not an indefinite uniqueness guarantee.
   */
  createCustomer(mapping: CustomerMapping): Promise<string>;

  /**
   * Verify test mode and customer ownership, then assign the caller-verified
   * Auth0 email if it changed. Email is contact data, never an ownership key;
   * keeping this separate preserves the original customer-creation parameters.
   */
  syncCustomerEmail(
    customerId: string,
    userId: string,
    verifiedEmail: string,
  ): Promise<void>;

  /**
   * Inspect all subscription pages for a purchase blocker. Only canceled and
   * incomplete_expired are nonblocking in this demo; pending/unpaid subscriptions
   * still block. This check neither proves access nor replaces the local lock.
   */
  hasBlockingSubscription(customerId: string): Promise<boolean>;

  /**
   * Create from the persisted price, URLs, expiry, and ownership references with
   * a stable user/request idempotency key. Retrying must reuse those parameters;
   * generating a fresh expiry would turn recovery into a different request.
   */
  createSession(attempt: CheckoutAttempt): Promise<CheckoutSession>;

  /**
   * Retrieve and validate current session data for resume/recovery. The service
   * still compares its ownership references against the stored attempt; even a
   * complete session alone is not evidence for granting Premium.
   */
  getSession(sessionId: string): Promise<CheckoutSession>;
}
