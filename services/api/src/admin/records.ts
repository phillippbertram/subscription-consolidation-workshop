import {
  ScanCommand,
  type DynamoDBDocumentClient,
  type ScanCommandInput,
} from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import {
  adminGrantSchema,
  subscriptionSchema,
  type AdminGrant,
  type Subscription,
} from '@premiumpass/domain';
import {
  adminAuditEntrySchema,
  type AdminAuditEntry,
  type AdminMarker,
  type StoredSnapshot,
} from '@premiumpass/api-contracts/admin';

type Item = Record<string, unknown>;

/** Every record family of the table, sorted into typed collections. */
export interface TableRecords {
  count: number;
  profiles: { userId: string; createdAt: string; identityHash: string }[];
  identities: Map<string, { issuer: string; subject: string; userId: string }>;
  snapshots: Map<string, StoredSnapshot>;
  subscriptions: { subscription: Subscription; demoScenario: string | null }[];
  adminGrants: Map<string, AdminGrant>;
  audits: (AdminAuditEntry & { userId: string })[];
  /**
   * Key `provider#reference` → owner binding. Stripe bindings also name the
   * customer, Google bindings the package. Purchase tokens are not kept here.
   */
  owners: Map<string, OwnerBinding>;
  stripeCustomers: Map<string, string | null>;
  stripeCustomerOwners: Map<string, string>;
  checkouts: {
    userId: string;
    requestId: string;
    planId: string;
    createdAt: string;
    expiresAt: string;
    sessionId: string | null;
  }[];
  activeCheckouts: Map<string, string>;
  markers: AdminMarker[];
  outbox: OutboxRecord[];
  unrecognized: { pk: string; sk: string; reason: string }[];
}

export interface OwnerBinding {
  userId: string;
  customerId: string | null;
  packageName: string | null;
}

const profileSchema = z.object({
  userId: z.uuid(),
  createdAt: z.iso.datetime(),
  identityHash: z.string(),
});
const snapshotSchema = z.object({
  revision: z.number().int().positive(),
  tier: z.enum(['free', 'premium']),
  effectiveUntil: z.iso.datetime().nullable(),
  evaluatedAt: z.iso.datetime(),
  grants: z.array(z.unknown()),
});
const identitySchema = z.object({
  issuer: z.string(),
  subject: z.string(),
  userId: z.uuid(),
});
const checkoutSchema = z.object({
  userId: z.uuid(),
  requestId: z.uuid(),
  // Older attempts were stored before plans existed; they were monthly.
  planId: z.string().default('premium_monthly'),
  createdAt: z.number(),
  expiresAt: z.number(),
  sessionId: z.string().optional(),
});
const markerSchema = z.object({
  userId: z.uuid().optional(),
  eventType: z.string().optional(),
  outcome: z.string().optional(),
  correlationId: z.string().optional(),
  processedAt: z.iso.datetime(),
  finishTransactionId: z.string().optional(),
  finishedAt: z.iso.datetime().optional(),
  needsAcknowledgement: z.boolean().optional(),
  completedAt: z.iso.datetime().optional(),
});
const outboxSchema = z.object({
  domainEventId: z.string(),
  userId: z.uuid(),
  revision: z.number().int().positive(),
  status: z.enum(['pending', 'sent']),
  createdAt: z.iso.datetime(),
  sentAt: z.iso.datetime().optional(),
  providerEventId: z.string(),
  correlationId: z.string(),
  entitlements: z.object({
    tier: z.enum(['free', 'premium']),
    effectiveUntil: z.iso.datetime().nullable(),
    grants: z.array(z.unknown()),
  }),
});
export type OutboxRecord = z.infer<typeof outboxSchema>;

/**
 * Read the whole table with one paginated, consistent scan.
 *
 * Demo simplification: user requests never scan, but this local table is
 * small, and one scan gives every page the same moment in time. A production
 * admin would read from indexes or a read model instead.
 */
export async function scanTable(
  client: DynamoDBDocumentClient,
  tableName: string,
): Promise<TableRecords> {
  const records = emptyRecords();
  let cursor: ScanCommandInput['ExclusiveStartKey'];
  do {
    const page = await client.send(
      new ScanCommand({
        TableName: tableName,
        ConsistentRead: true,
        ...(cursor ? { ExclusiveStartKey: cursor } : {}),
      }),
    );
    for (const item of page.Items ?? []) {
      records.count++;
      classify(records, item);
    }

    cursor = page.LastEvaluatedKey;
  } while (cursor && Object.keys(cursor).length);

  return records;
}

function emptyRecords(): TableRecords {
  return {
    count: 0,
    profiles: [],
    identities: new Map(),
    snapshots: new Map(),
    subscriptions: [],
    adminGrants: new Map(),
    audits: [],
    owners: new Map(),
    stripeCustomers: new Map(),
    stripeCustomerOwners: new Map(),
    checkouts: [],
    activeCheckouts: new Map(),
    markers: [],
    outbox: [],
    unrecognized: [],
  };
}

/**
 * Sort one item by its key pattern (see docs/DYNAMODB_DATA_MODEL.md). Each
 * record is validated and must sit under its owner's key. Anything else is
 * listed as unrecognized instead of being dropped silently.
 */
function classify(records: TableRecords, item: Item) {
  const pk = typeof item.pk === 'string' ? item.pk : '';
  const sk = typeof item.sk === 'string' ? item.sk : '';
  const reject = (reason: string) => {
    records.unrecognized.push({ pk, sk, reason });
  };

  const user = /^USER#([0-9a-f-]{36})$/.exec(pk)?.[1];
  if (user) {
    classifyUserRecord(records, user, sk, item, reject);
    return;
  }

  if (pk.startsWith('IDENTITY#') && sk === 'MAP') {
    const identity = identitySchema.safeParse(item);
    if (!identity.success) {
      return reject('invalid identity map');
    }

    records.identities.set(pk.slice('IDENTITY#'.length), identity.data);
    return;
  }

  const owner = /^PROVIDER#(stripe|apple|google)#SUB#(.+)$/.exec(pk);
  if (owner && sk === 'OWNER') {
    const userId = z.uuid().safeParse(item.userId);
    if (!userId.success) {
      return reject('owner binding without user');
    }

    records.owners.set(`${owner[1]}#${owner[2]}`, {
      userId: userId.data,
      customerId: typeof item.customerId === 'string' ? item.customerId : null,
      packageName:
        typeof item.packageName === 'string' ? item.packageName : null,
    });
    return;
  }

  const customer = /^PROVIDER#stripe#CUSTOMER#(cus_[A-Za-z0-9]+)$/.exec(pk);
  if (customer?.[1] && sk === 'OWNER') {
    const userId = z.uuid().safeParse(item.userId);
    if (!userId.success) {
      return reject('customer binding without user');
    }

    records.stripeCustomerOwners.set(customer[1], userId.data);
    return;
  }

  if (pk.startsWith('CHECKOUT#') && sk === 'REQUEST') {
    const checkout = checkoutSchema.safeParse(item);
    if (
      !checkout.success ||
      pk !== `CHECKOUT#${checkout.data.userId}#${checkout.data.requestId}`
    ) {
      return reject('invalid checkout request');
    }

    const { sessionId, createdAt, expiresAt, ...rest } = checkout.data;
    records.checkouts.push({
      ...rest,
      // Checkout times are Unix seconds; every other record uses ISO strings.
      createdAt: new Date(createdAt * 1000).toISOString(),
      expiresAt: new Date(expiresAt * 1000).toISOString(),
      sessionId: sessionId ?? null,
    });
    return;
  }

  const marker =
    /^EVENT#(stripe|apple#Sandbox|google|local_expiration)#(.+)$/.exec(pk);
  if (marker?.[1] && marker[2] && sk === 'PROCESSED') {
    classifyMarker(records, pk, marker[1], marker[2], item, reject);
    return;
  }

  if (pk.startsWith('OUTBOX#') && sk === 'EVENT') {
    const entry = outboxSchema.safeParse(item);
    if (
      !entry.success ||
      pk !== `OUTBOX#${entry.data.domainEventId}` ||
      entry.data.domainEventId !== `${entry.data.userId}:${entry.data.revision}`
    ) {
      return reject('invalid outbox entry');
    }

    records.outbox.push(entry.data);
    return;
  }

  reject('unknown record type');
}

function classifyUserRecord(
  records: TableRecords,
  userId: string,
  sk: string,
  item: Item,
  reject: (reason: string) => void,
) {
  // Every record under USER#U must also name U inside; a mismatch is reported.
  if (item.userId !== userId) {
    return reject('stored userId differs from its key');
  }

  if (sk === 'PROFILE') {
    const profile = profileSchema.safeParse(item);
    if (!profile.success) {
      return reject('invalid profile');
    }

    records.profiles.push(profile.data);
    return;
  }

  if (sk === 'ENTITLEMENTS') {
    const snapshot = snapshotSchema.safeParse(item);
    if (!snapshot.success) {
      return reject('invalid entitlement snapshot');
    }

    const { grants, ...summary } = snapshot.data;
    records.snapshots.set(userId, { ...summary, grantCount: grants.length });
    return;
  }

  if (sk.startsWith('SUB#')) {
    const subscription = subscriptionSchema.safeParse(item);
    if (
      !subscription.success ||
      sk !==
        `SUB#${subscription.data.provider}#${subscription.data.providerSubscriptionId}`
    ) {
      return reject('invalid subscription');
    }

    records.subscriptions.push({
      subscription: subscription.data,
      demoScenario:
        typeof item.demoScenario === 'string' ? item.demoScenario : null,
    });
    return;
  }

  if (sk === 'ADMIN_GRANT#premium') {
    const grant = adminGrantSchema.safeParse(item);
    if (!grant.success) {
      return reject('invalid admin grant');
    }

    records.adminGrants.set(userId, grant.data);
    return;
  }

  if (sk.startsWith('ADMIN_AUDIT#')) {
    const audit = adminAuditEntrySchema.safeParse(item);
    if (!audit.success || sk !== `ADMIN_AUDIT#${audit.data.requestId}`) {
      return reject('invalid admin audit');
    }

    records.audits.push({ ...audit.data, userId });
    return;
  }

  if (sk === 'CUSTOMER#stripe') {
    const customerId = z
      .string()
      .regex(/^cus_[A-Za-z0-9]+$/)
      .safeParse(item.customerId);
    // The customer ID stays empty until Stripe confirmed the creation intent.
    records.stripeCustomers.set(
      userId,
      customerId.success ? customerId.data : null,
    );
    return;
  }

  if (sk === 'CHECKOUT#ACTIVE') {
    const requestId = z.uuid().safeParse(item.requestId);
    if (!requestId.success) {
      return reject('invalid active checkout pointer');
    }

    records.activeCheckouts.set(userId, requestId.data);
    return;
  }

  reject('unknown user record');
}

function classifyMarker(
  records: TableRecords,
  pk: string,
  family: string,
  eventId: string,
  item: Item,
  reject: (reason: string) => void,
) {
  const marker = markerSchema.safeParse(item);
  if (!marker.success) {
    return reject('invalid processing marker');
  }

  const data = marker.data;
  const provider = family === 'apple#Sandbox' ? 'apple' : family;
  // Apple and Google need one more provider call after the commit. Show
  // whether the worker has recorded it, so a stuck completion is visible.
  let completion: AdminMarker['completion'] = 'not_needed';
  let completedAt: string | null = null;
  if (provider === 'apple' && data.finishTransactionId) {
    completion = data.finishedAt ? 'done' : 'pending';
    completedAt = data.finishedAt ?? null;
  }

  if (provider === 'google') {
    completedAt = data.completedAt ?? null;
    if (completedAt) {
      completion = 'done';
    } else if (data.needsAcknowledgement) {
      completion = 'pending';
    }
  }

  records.markers.push({
    key: pk,
    provider: provider as AdminMarker['provider'],
    eventId,
    eventType:
      data.eventType ?? (provider === 'local_expiration' ? 'expiration' : null),
    userId: data.userId ?? null,
    outcome: data.outcome ?? null,
    correlationId: data.correlationId ?? null,
    processedAt: data.processedAt,
    completion,
    completedAt,
  });
}
