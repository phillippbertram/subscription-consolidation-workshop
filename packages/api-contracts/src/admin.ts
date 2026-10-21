import { z } from 'zod';
import { entitlementsSchema, subscriptionSchema } from './index.js';

// HTTP contract between the local admin console and the API's /admin routes.
// The console only displays these values; every rule that produces them
// (access, drift, checks) runs in the API with one clock per request.

export const adminSecretHeader = 'X-Admin-Secret';

/** How one subscription contributes to access at the response's readAt time. */
export const subscriptionEvaluationSchema = z.object({
  /** grants: counts until `until`; ended: its boundary `until` has passed. */
  result: z.enum(['grants', 'ended', 'warning', 'none']),
  until: z.iso.datetime().nullable(),
  reason: z.string().nullable(),
});

export const adminSubscriptionSchema = subscriptionSchema.extend({
  /** A provider owner binding exists and names this user. */
  ownerBound: z.boolean(),
  /** A provider owner binding exists but names another user. */
  ownerMismatch: z.boolean(),
  /** Marker of CLI demo rows; such rows are never refreshed from a provider. */
  demoScenario: z.string().nullable(),
  evaluation: subscriptionEvaluationSchema,
});

export const adminGrantViewSchema = z.object({
  state: z.enum(['active', 'revoked']),
  expiresAt: z.iso.datetime().nullable(),
  revision: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const adminAuditEntrySchema = z.object({
  requestId: z.uuid(),
  action: z.enum(['grant', 'revoke']),
  outcome: z.enum(['changed', 'unchanged']),
  actor: z.string(),
  reason: z.string(),
  expiresAt: z.iso.datetime().nullable(),
  at: z.iso.datetime(),
  aggregateRevision: z.number().int().positive(),
});

/** Summary of the stored ENTITLEMENTS record; older grants may lack `source`. */
export const storedSnapshotSchema = z.object({
  revision: z.number().int().positive(),
  tier: z.enum(['free', 'premium']),
  effectiveUntil: z.iso.datetime().nullable(),
  evaluatedAt: z.iso.datetime(),
  grantCount: z.number().int().nonnegative(),
});

export const adminCheckoutSchema = z.object({
  requestId: z.uuid(),
  planId: z.string(),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  /** Stripe Checkout session ID once attached; never the checkout URL. */
  sessionId: z.string().nullable(),
  active: z.boolean(),
});

/**
 * One provider identifier connected to the user. `binding` says how the link
 * is recorded:
 * - both: the user's record and the provider owner binding name this user
 * - binding_only: an owner binding names this user, but no record exists
 * - record_only: a record exists without an owner binding (yet)
 * - other_user: the owner binding names a different user
 * - stored: kept with another record (a checkout request); proves nothing
 * - derived: not stored; the app sends the internal ID to the store
 */
export const adminProviderLinkSchema = z.object({
  provider: z.enum(['stripe', 'apple', 'google']),
  kind: z.enum([
    'customer',
    'subscription',
    'checkout_session',
    'original_transaction',
    'purchase',
    'account_token',
  ]),
  value: z.string(),
  binding: z.enum([
    'both',
    'binding_only',
    'record_only',
    'other_user',
    'stored',
    'derived',
  ]),
  note: z.string().nullable(),
});

export const adminUserSchema = z.object({
  userId: z.uuid(),
  createdAt: z.iso.datetime(),
  identity: z.object({ issuer: z.string(), subject: z.string() }).nullable(),
  subscriptions: z.array(adminSubscriptionSchema),
  adminGrant: adminGrantViewSchema.nullable(),
  audit: z.array(adminAuditEntrySchema),
  /** Access computed now from stored records, exactly like the user API. */
  access: entitlementsSchema,
  /** The ENTITLEMENTS record the last commit wrote, or null before the first. */
  snapshot: storedSnapshotSchema.nullable(),
  drift: z.boolean(),
  /** Stripe, Apple, and Google identifiers connected to this user. */
  providerLinks: z.array(adminProviderLinkSchema),
  checkouts: z.array(adminCheckoutSchema),
  lastActivityAt: z.iso.datetime().nullable(),
});

export const adminOutboxEntrySchema = z.object({
  domainEventId: z.string(),
  userId: z.uuid(),
  revision: z.number().int().positive(),
  status: z.enum(['pending', 'sent']),
  createdAt: z.iso.datetime(),
  sentAt: z.iso.datetime().nullable(),
  providerEventId: z.string(),
  correlationId: z.string(),
  tier: z.enum(['free', 'premium']),
  effectiveUntil: z.iso.datetime().nullable(),
  grants: z.number().int().nonnegative(),
  /** Tier of the same user's previous outbox entry, if there is one. */
  previousTier: z.enum(['free', 'premium']).nullable(),
});

export const adminMarkerSchema = z.object({
  key: z.string(),
  provider: z.enum(['stripe', 'apple', 'google', 'local_expiration']),
  eventId: z.string(),
  eventType: z.string().nullable(),
  userId: z.uuid().nullable(),
  outcome: z.string().nullable(),
  correlationId: z.string().nullable(),
  processedAt: z.iso.datetime(),
  /** Store follow-up after the commit: Apple finish or Google acknowledgement. */
  completion: z.enum(['not_needed', 'pending', 'done']),
  completedAt: z.iso.datetime().nullable(),
});

export const adminQueueSchema = z.object({
  role: z.enum(['work', 'work_dlq', 'events', 'events_dlq']),
  name: z.string(),
  available: z.boolean(),
  visible: z.number().int().nonnegative(),
  inFlight: z.number().int().nonnegative(),
  delayed: z.number().int().nonnegative(),
});

export const adminCheckSchema = z.object({
  id: z.string(),
  severity: z.enum(['ok', 'info', 'warning', 'critical']),
  title: z.string(),
  detail: z.string(),
  userIds: z.array(z.uuid()),
});

export const adminStateSchema = z.object({
  readAt: z.iso.datetime(),
  table: z.string(),
  recordCount: z.number().int().nonnegative(),
  unrecognized: z.array(
    z.object({ pk: z.string(), sk: z.string(), reason: z.string() }),
  ),
  /** Providers the local backend is configured for; refresh skips the rest. */
  providers: z.object({
    stripe: z.boolean(),
    apple: z.boolean(),
    google: z.boolean(),
  }),
  users: z.array(adminUserSchema),
  outbox: z.array(adminOutboxEntrySchema),
  markers: z.array(adminMarkerSchema),
  queues: z.array(adminQueueSchema),
  checks: z.array(adminCheckSchema),
});

/** Grant or revoke complimentary Premium; the server sets the audit actor. */
export const adminPremiumRequestSchema = z.strictObject({
  requestId: z.uuid(),
  action: z.enum(['grant', 'revoke']),
  expiresAt: z.iso.datetime().nullable(),
  reason: z.string().trim().min(1).max(300),
  dryRun: z.boolean(),
});

export const adminPremiumResultSchema = z.object({
  outcome: z.enum(['preview', 'changed', 'unchanged', 'duplicate']),
  aggregateRevision: z.number().int().positive(),
  actor: z.string(),
  before: adminGrantViewSchema.nullable(),
  after: adminGrantViewSchema.nullable(),
});

/**
 * A run ID makes queued jobs repeat-safe: a second submit with the same ID
 * produces the same event IDs, and the worker skips completed ones.
 */
export const adminRunRequestSchema = z.strictObject({
  runId: z.uuid(),
  dryRun: z.boolean(),
});

export const adminJobPlanSchema = z.object({
  kind: z.enum(['stripe', 'apple', 'google', 'expiration', 'demo']),
  reference: z.string(),
  eventId: z.string().nullable(),
  status: z.enum(['would_queue', 'queued', 'skipped']),
  reason: z.string().nullable(),
});

export const adminRunResultSchema = z.object({
  runId: z.uuid(),
  dryRun: z.boolean(),
  jobs: z.array(adminJobPlanSchema),
});

export const adminRedriveRequestSchema = z.strictObject({
  dryRun: z.boolean(),
});

export const adminRedriveResultSchema = z.object({
  dryRun: z.boolean(),
  moved: z.number().int().nonnegative(),
  messages: z.array(
    z.object({
      messageId: z.string(),
      provider: z.string(),
      eventType: z.string(),
      eventId: z.string(),
      receiveCount: z.number().int().nonnegative(),
    }),
  ),
});

export type SubscriptionEvaluation = z.infer<
  typeof subscriptionEvaluationSchema
>;
export type AdminSubscription = z.infer<typeof adminSubscriptionSchema>;
export type AdminGrantView = z.infer<typeof adminGrantViewSchema>;
export type AdminAuditEntry = z.infer<typeof adminAuditEntrySchema>;
export type StoredSnapshot = z.infer<typeof storedSnapshotSchema>;
export type AdminCheckout = z.infer<typeof adminCheckoutSchema>;
export type AdminProviderLink = z.infer<typeof adminProviderLinkSchema>;
export type AdminUser = z.infer<typeof adminUserSchema>;
export type AdminOutboxEntry = z.infer<typeof adminOutboxEntrySchema>;
export type AdminMarker = z.infer<typeof adminMarkerSchema>;
export type AdminQueue = z.infer<typeof adminQueueSchema>;
export type AdminCheck = z.infer<typeof adminCheckSchema>;
export type AdminState = z.infer<typeof adminStateSchema>;
export type AdminPremiumRequest = z.infer<typeof adminPremiumRequestSchema>;
export type AdminPremiumResult = z.infer<typeof adminPremiumResultSchema>;
export type AdminRunRequest = z.infer<typeof adminRunRequestSchema>;
export type AdminJobPlan = z.infer<typeof adminJobPlanSchema>;
export type AdminRunResult = z.infer<typeof adminRunResultSchema>;
export type AdminRedriveRequest = z.infer<typeof adminRedriveRequestSchema>;
export type AdminRedriveResult = z.infer<typeof adminRedriveResultSchema>;
