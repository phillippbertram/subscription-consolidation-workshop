import type { SQSClient } from '@aws-sdk/client-sqs';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  deriveEntitlements,
  type Entitlements,
  type Subscription,
} from '@premiumpass/domain';
import type {
  AdminOutboxEntry,
  AdminProviderLink,
  AdminState,
  AdminSubscription,
  AdminUser,
  SubscriptionEvaluation,
} from '@premiumpass/api-contracts/admin';
import { runChecks } from './checks.js';
import { readQueues } from './queues.js';
import { scanTable, type OutboxRecord, type TableRecords } from './records.js';

export interface StateDependencies {
  documentClient: DynamoDBDocumentClient;
  sqs: SQSClient;
  tableName: string;
  providers: AdminState['providers'];
}

/**
 * Build everything the console shows from one table scan, the queue depths,
 * and a single `now`. Access is recomputed with the same domain function the
 * user API uses, so the console can compare it with the stored snapshot.
 */
export async function loadAdminState(
  dependencies: StateDependencies,
  now: Date,
): Promise<AdminState> {
  const [records, queues] = await Promise.all([
    scanTable(dependencies.documentClient, dependencies.tableName),
    readQueues(dependencies.sqs),
  ]);
  const users = records.profiles
    .map((profile) => buildUser(records, profile, now))
    .sort((a, b) =>
      (b.lastActivityAt ?? '').localeCompare(a.lastActivityAt ?? ''),
    );
  const outbox = buildOutbox(records.outbox);
  const markers = [...records.markers].sort((a, b) =>
    b.processedAt.localeCompare(a.processedAt),
  );

  return {
    readAt: now.toISOString(),
    table: dependencies.tableName,
    recordCount: records.count,
    unrecognized: records.unrecognized,
    providers: dependencies.providers,
    users,
    outbox,
    markers,
    queues,
    checks: runChecks({
      users,
      outbox,
      markers,
      queues,
      unrecognized: records.unrecognized.length,
      now,
    }),
  };
}

function buildUser(
  records: TableRecords,
  profile: TableRecords['profiles'][number],
  now: Date,
): AdminUser {
  const { userId } = profile;
  const stored = records.subscriptions.filter(
    (entry) => entry.subscription.userId === userId,
  );
  const grant = records.adminGrants.get(userId) ?? null;
  const access = deriveEntitlements(
    stored.map((entry) => entry.subscription),
    now,
    grant,
  );
  const snapshot = records.snapshots.get(userId) ?? null;
  const identity = records.identities.get(profile.identityHash);

  return {
    userId,
    createdAt: profile.createdAt,
    identity:
      identity?.userId === userId
        ? { issuer: identity.issuer, subject: identity.subject }
        : null,
    subscriptions: stored.map(({ subscription, demoScenario }) =>
      buildSubscription(records, subscription, demoScenario, access, now),
    ),
    adminGrant: grant
      ? {
          state: grant.state,
          expiresAt: grant.expiresAt,
          revision: grant.revision,
          createdAt: grant.createdAt,
          updatedAt: grant.updatedAt,
        }
      : null,
    audit: records.audits
      .filter((entry) => entry.userId === userId)
      .map((entry) => ({
        requestId: entry.requestId,
        action: entry.action,
        outcome: entry.outcome,
        actor: entry.actor,
        reason: entry.reason,
        expiresAt: entry.expiresAt,
        at: entry.at,
        aggregateRevision: entry.aggregateRevision,
      }))
      .sort((a, b) => b.at.localeCompare(a.at)),
    access,
    snapshot,
    // A missing snapshot is only drift when access exists without one.
    drift: snapshot
      ? snapshot.tier !== access.tier ||
        snapshot.effectiveUntil !== access.effectiveUntil
      : access.tier === 'premium',
    providerLinks: providerLinks(records, userId),
    checkouts: records.checkouts
      .filter((checkout) => checkout.userId === userId)
      .map((checkout) => ({
        requestId: checkout.requestId,
        planId: checkout.planId,
        createdAt: checkout.createdAt,
        expiresAt: checkout.expiresAt,
        sessionId: checkout.sessionId,
        active: records.activeCheckouts.get(userId) === checkout.requestId,
      }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    lastActivityAt: lastActivity(records, userId, profile.createdAt),
  };
}

function buildSubscription(
  records: TableRecords,
  subscription: Subscription,
  demoScenario: string | null,
  access: Entitlements,
  now: Date,
): AdminSubscription {
  const owner = records.owners.get(
    `${subscription.provider}#${subscription.providerSubscriptionId}`,
  );
  return {
    ...subscription,
    ownerBound: owner?.userId === subscription.userId,
    ownerMismatch: owner !== undefined && owner.userId !== subscription.userId,
    demoScenario,
    evaluation: evaluate(subscription, access, now),
  };
}

/**
 * Every Stripe, Apple, and Google identifier connected to one user, with how
 * the connection is recorded. Ownership lives in two places on purpose: the
 * user's own record and a provider owner binding that a later event looks up.
 * Both should name the same user; anything else is shown, not hidden.
 */
function providerLinks(
  records: TableRecords,
  userId: string,
): AdminProviderLink[] {
  const links: AdminProviderLink[] = [];

  // Stripe customer: forward record under the user, reverse binding by customer.
  const customerId = records.stripeCustomers.get(userId);
  if (customerId === null) {
    links.push({
      provider: 'stripe',
      kind: 'customer',
      value: 'creation pending',
      binding: 'record_only',
      note: 'Creation intent stored; Stripe has not confirmed a customer yet.',
    });
  } else if (customerId !== undefined) {
    const reverse = records.stripeCustomerOwners.get(customerId);
    links.push({
      provider: 'stripe',
      kind: 'customer',
      value: customerId,
      binding:
        reverse === undefined ? 'record_only' : bindingFor(reverse, userId),
      note:
        reverse === undefined
          ? 'Reverse binding PROVIDER#stripe#CUSTOMER#… is missing.'
          : null,
    });
  }

  for (const [reverseCustomer, owner] of records.stripeCustomerOwners) {
    if (owner === userId && reverseCustomer !== customerId) {
      links.push({
        provider: 'stripe',
        kind: 'customer',
        value: reverseCustomer,
        binding: 'binding_only',
        note: 'Reverse binding without a matching CUSTOMER#stripe record.',
      });
    }
  }

  // Provider subscriptions: the user's SUB records plus owner bindings naming them.
  const references = new Set<string>();
  for (const { subscription } of records.subscriptions) {
    if (
      subscription.userId === userId &&
      subscription.provider !== 'apple_mock'
    ) {
      references.add(
        `${subscription.provider}#${subscription.providerSubscriptionId}`,
      );
    }
  }

  for (const [key, owner] of records.owners) {
    if (owner.userId === userId) {
      references.add(key);
    }
  }

  for (const key of [...references].sort()) {
    links.push(subscriptionLink(records, userId, key));
  }

  for (const checkout of records.checkouts) {
    if (checkout.userId === userId && checkout.sessionId) {
      links.push({
        provider: 'stripe',
        kind: 'checkout_session',
        value: checkout.sessionId,
        binding: 'stored',
        note: `Checkout request ${checkout.requestId.slice(0, 8)}… (${checkout.planId}); a session is no proof of payment.`,
      });
    }
  }

  // The apps hand the internal UUID to both stores with every purchase, so a
  // store event can name its owner. It is derived, never stored separately.
  links.push(
    {
      provider: 'apple',
      kind: 'account_token',
      value: userId,
      binding: 'derived',
      note: 'Sent as appAccountToken with every purchase; Apple returns it in signed transactions.',
    },
    {
      provider: 'google',
      kind: 'account_token',
      value: userId,
      binding: 'derived',
      note: 'Sent as obfuscatedAccountId; Google returns it in purchase details.',
    },
  );

  const order = ['stripe', 'apple', 'google'];
  return links.sort(
    (a, b) => order.indexOf(a.provider) - order.indexOf(b.provider),
  );
}

function subscriptionLink(
  records: TableRecords,
  userId: string,
  key: string,
): AdminProviderLink {
  const separator = key.indexOf('#');
  const provider = key.slice(0, separator) as AdminProviderLink['provider'];
  const reference = key.slice(separator + 1);
  const owner = records.owners.get(key);
  const hasRecord = records.subscriptions.some(
    ({ subscription }) =>
      subscription.userId === userId &&
      subscription.provider === provider &&
      subscription.providerSubscriptionId === reference,
  );

  let binding: AdminProviderLink['binding'] = 'record_only';
  if (owner && hasRecord) {
    binding = bindingFor(owner.userId, userId);
  } else if (owner) {
    binding = 'binding_only';
  }

  const notes: Record<AdminProviderLink['provider'], string | null> = {
    stripe: owner?.customerId ? `Customer ${owner.customerId}.` : null,
    apple: 'Original transaction ID in the Sandbox environment.',
    // The purchase token is private: only its SHA-256 digest is shown.
    google: `Package ${owner?.packageName ?? reference.split(':')[0]}; reference = package + SHA-256 of the purchase token, which is never shown.`,
  };
  return {
    provider,
    kind:
      provider === 'stripe'
        ? 'subscription'
        : provider === 'apple'
          ? 'original_transaction'
          : 'purchase',
    value: reference,
    binding,
    note: notes[provider],
  };
}

function bindingFor(owner: string, userId: string) {
  return owner === userId ? ('both' as const) : ('other_user' as const);
}

/**
 * Explain one subscription's part in the derived access. deriveEntitlements
 * already decided; this only finds the subscription in its result.
 */
function evaluate(
  subscription: Subscription,
  access: Entitlements,
  now: Date,
): SubscriptionEvaluation {
  const matches = (entry: {
    provider: string;
    providerSubscriptionId: string;
  }) =>
    entry.provider === subscription.provider &&
    entry.providerSubscriptionId === subscription.providerSubscriptionId;

  const grant = access.grants.find(
    (candidate) => candidate.source === 'provider' && matches(candidate),
  );
  if (grant) {
    return { result: 'grants', until: grant.validUntil, reason: null };
  }

  const warning = access.warnings.find(matches);
  if (warning) {
    return { result: 'warning', until: null, reason: warning.reason };
  }

  const boundary = subscription.graceUntil ?? subscription.accessUntil;
  if (boundary && Date.parse(boundary) <= now.getTime()) {
    return { result: 'ended', until: boundary, reason: null };
  }

  return {
    result: 'none',
    until: null,
    reason: `State ${subscription.state} grants no access`,
  };
}

/** Each entry keeps its own snapshot; the previous one shows what changed. */
function buildOutbox(entries: OutboxRecord[]): AdminOutboxEntry[] {
  const byRevision = [...entries].sort((a, b) => a.revision - b.revision);
  const lastTier = new Map<string, 'free' | 'premium'>();
  const result: AdminOutboxEntry[] = [];
  for (const entry of byRevision) {
    result.push({
      domainEventId: entry.domainEventId,
      userId: entry.userId,
      revision: entry.revision,
      status: entry.status,
      createdAt: entry.createdAt,
      sentAt: entry.sentAt ?? null,
      providerEventId: entry.providerEventId,
      correlationId: entry.correlationId,
      tier: entry.entitlements.tier,
      effectiveUntil: entry.entitlements.effectiveUntil,
      grants: entry.entitlements.grants.length,
      previousTier: lastTier.get(entry.userId) ?? null,
    });
    lastTier.set(entry.userId, entry.entitlements.tier);
  }

  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function lastActivity(
  records: TableRecords,
  userId: string,
  createdAt: string,
) {
  const times = [
    createdAt,
    ...records.markers
      .filter((marker) => marker.userId === userId)
      .map((marker) => marker.processedAt),
    ...records.audits
      .filter((entry) => entry.userId === userId)
      .map((entry) => entry.at),
    ...records.outbox
      .filter((entry) => entry.userId === userId)
      .map((entry) => entry.createdAt),
    ...records.checkouts
      .filter((checkout) => checkout.userId === userId)
      .map((checkout) => checkout.createdAt),
  ];
  return times.sort().at(-1) ?? null;
}
