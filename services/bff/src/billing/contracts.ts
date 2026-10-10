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

export interface BillingStore {
  reserveCustomer(userId: string, now: number): Promise<CustomerMapping>;
  saveCustomer(mapping: CustomerMapping, customerId: string): Promise<void>;
  getCustomerOwner(customerId: string): Promise<string | null>;
  getAttempt(
    userId: string,
    requestId: string,
  ): Promise<CheckoutAttempt | null>;
  getActiveAttemptId(userId: string): Promise<string | null>;
  reserveAttempt(
    attempt: CheckoutAttempt,
    previousId: string | null,
  ): Promise<boolean>;
  saveSession(attempt: CheckoutAttempt, sessionId: string): Promise<void>;
}

export interface CheckoutSession {
  id: string;
  customerId: string;
  userId: string;
  requestId: string;
  status: 'open' | 'complete' | 'expired';
  url: string | null;
  expiresAt: number;
}

export interface BillingProvider {
  validatePrice(priceId: string): Promise<void>;
  createCustomer(mapping: CustomerMapping): Promise<string>;
  syncCustomerEmail(
    customerId: string,
    userId: string,
    verifiedEmail: string,
  ): Promise<void>;
  hasBlockingSubscription(customerId: string): Promise<boolean>;
  createSession(attempt: CheckoutAttempt): Promise<CheckoutSession>;
  getSession(sessionId: string): Promise<CheckoutSession>;
}
