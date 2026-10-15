import { randomUUID } from 'node:crypto';
import type { DynamoDbProcessingStore } from '../processing/dynamodb-processing.js';
import { RevisionConflict } from '../processing/contracts.js';
import {
  GRACE_MS,
  subscriptionSchema,
  type Subscription,
} from '@premiumpass/domain';

export const scenarios = [
  'free',
  'active',
  'pending',
  'trialing',
  'canceling',
  'expired',
  'revoked',
  'paused',
  'canceled',
  'grace',
  'grace-expired',
  'initial-failure',
  'multiple',
  'unknown-product',
  'unknown-status',
  'expiring',
] as const;

export async function seedSubscription(
  store: DynamoDbProcessingStore,
  tableName: string,
  userId: string,
  scenario: (typeof scenarios)[number],
) {
  const pk = `USER#${userId}`;
  const now = Date.now();
  const at = (offset: number) => new Date(now + offset).toISOString();
  const hour = 60 * 60 * 1000;
  const marker = 'p05-local-demo';

  function record(
    provider: Subscription['provider'],
    changes: Partial<Subscription> = {},
  ) {
    return subscriptionSchema.parse({
      userId,
      provider,
      providerSubscriptionId: `demo-p05-${provider}`,
      productId: 'premium_monthly',
      state: 'active',
      providerStatus: 'active',
      cancelAtPeriodEnd: false,
      accessUntil: at(hour),
      graceUntil: null,
      verifiedAt: at(0),
      revision: 1,
      ...changes,
    });
  }

  let changes: Partial<Subscription> = {};
  switch (scenario) {
    case 'pending':
    case 'paused':
    case 'canceled':
    case 'revoked':
      changes = {
        state: scenario,
        providerStatus: scenario,
        ...(scenario === 'pending' ? { accessUntil: null } : {}),
      };
      break;
    case 'trialing':
      changes = { state: 'trialing', providerStatus: 'trialing' };
      break;
    case 'canceling':
      changes = { cancelAtPeriodEnd: true };
      break;
    case 'expired':
      changes = { accessUntil: at(-1) };
      break;
    case 'expiring':
      changes = { accessUntil: at(30_000) };
      break;
    case 'grace':
      changes = {
        state: 'past_due',
        providerStatus: 'past_due',
        accessUntil: at(-hour),
        graceUntil: at(-hour + GRACE_MS),
      };
      break;
    case 'grace-expired':
      changes = {
        state: 'past_due',
        providerStatus: 'past_due',
        accessUntil: at(-25 * hour),
        graceUntil: at(-hour),
      };
      break;
    case 'initial-failure':
      changes = {
        state: 'past_due',
        providerStatus: 'past_due',
        accessUntil: null,
        graceUntil: at(hour),
      };
      break;
    case 'multiple':
      changes = { state: 'revoked', providerStatus: 'revoked' };
      break;
    case 'unknown-product':
      changes = { productId: 'unmapped_product' };
      break;
    case 'unknown-status':
      changes = { state: 'new_state', providerStatus: 'new_state' };
      break;
  }

  const apple = record('apple_mock', changes);
  const google = record('google_mock', { accessUntil: at(2 * hour) });
  for (let attempt = 0; ; attempt++) {
    const aggregate = await store.load(userId);
    const records = [apple, google].map((subscription) => ({
      ...subscription,
      revision:
        (aggregate.subscriptions.find(
          (s) =>
            s.provider === subscription.provider &&
            s.providerSubscriptionId === subscription.providerSubscriptionId,
        )?.revision ?? 0) + 1,
    }));
    const keep = (subscription: Subscription) =>
      scenario !== 'free' &&
      (subscription.provider === 'apple_mock' || scenario === 'multiple');
    const subscriptions = aggregate.subscriptions.filter(
      (s) =>
        !records.some(
          (record) =>
            record.provider === s.provider &&
            record.providerSubscriptionId === s.providerSubscriptionId,
        ),
    );
    subscriptions.push(...records.filter(keep));
    const writes = records.map((subscription) => {
      const key = {
        pk,
        sk: `SUB#${subscription.provider}#${subscription.providerSubscriptionId}`,
      };
      const common = {
        TableName: tableName,
        ConditionExpression:
          'attribute_not_exists(pk) OR demoScenario = :marker',
        ExpressionAttributeValues: { ':marker': marker },
      };
      return keep(subscription)
        ? {
            Put: {
              ...common,
              Item: { ...key, ...subscription, demoScenario: marker },
            },
          }
        : { Delete: { ...common, Key: key } };
    });
    try {
      await store.commit(aggregate, subscriptions, writes, new Date(now), {
        eventId: `local-demo-${randomUUID()}`,
        correlationId: randomUUID(),
      });
      break;
    } catch (error) {
      if (!(error instanceof RevisionConflict) || attempt >= 2) {
        throw error;
      }
    }
  }

  return store.load(userId);
}
