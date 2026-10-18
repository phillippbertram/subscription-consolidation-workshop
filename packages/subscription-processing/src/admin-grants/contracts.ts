import { z } from 'zod';
import { adminGrantSchema } from '@premiumpass/domain';
import type { Aggregate } from '../processing/contracts.js';

export const adminGrantRequestSchema = z.object({
  requestId: z.uuid(),
  userId: z.uuid(),
  action: z.enum(['grant', 'revoke']),
  reason: z
    .string()
    .trim()
    .min(1)
    .max(300)
    .regex(/^[^\p{Cc}]+$/u),
  actor: z.string().min(1),
  expiresAt: z.iso.datetime().nullable(),
});
export const adminGrantAuditSchema = adminGrantRequestSchema.extend({
  aggregateRevision: z.number().int().positive(),
  at: z.iso.datetime(),
  outcome: z.enum(['changed', 'unchanged']),
  before: adminGrantSchema.nullable(),
  after: adminGrantSchema.nullable(),
});

export type AdminGrantRequest = z.infer<typeof adminGrantRequestSchema>;
export type AdminGrantAudit = z.infer<typeof adminGrantAuditSchema>;

/** Persist a grant, its receipt, access, and outbox intent as one guarded change. */
export interface AdminGrantStore {
  load(userId: string): Promise<Aggregate>;
  receipt(userId: string, requestId: string): Promise<AdminGrantAudit | null>;
  commit(
    aggregate: Aggregate,
    audit: AdminGrantAudit,
    now: Date,
  ): Promise<void>;
}
