import { randomUUID } from 'node:crypto';
import {
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
  type DynamoDBDocumentClient,
  type QueryCommandInput,
} from '@aws-sdk/lib-dynamodb';
import {
  googleMockIdSchema,
  type GoogleMockJob,
} from '@premiumpass/billing-contracts';
import {
  GRACE_MS,
  subscriptionSchema,
  type Subscription,
} from '@premiumpass/domain';
import { z } from 'zod';
import { ProcessingError } from '../../processing/contracts.js';
import { sameDomainState } from '../../processing/subscription-state.js';

export const mockScenarios = [
  'active',
  'renewal_failed',
  'canceling',
  'expired',
  'revoked',
  'pending',
] as const;
const stateSchema = z.object({
  userId: z.uuid(),
  subscriptionId: googleMockIdSchema,
  status: z.enum(['active', 'past_due', 'expired', 'revoked', 'pending']),
  accessUntil: z.iso.datetime().nullable(),
  graceUntil: z.iso.datetime().nullable(),
  cancelAtPeriodEnd: z.boolean(),
  revision: z.number().int().positive(),
  updatedAt: z.iso.datetime(),
});
export type GoogleMockState = z.infer<typeof stateSchema>;

export function mockKey(userId: string, subscriptionId: string) {
  return { pk: `MOCK#google#USER#${userId}`, sk: `SUB#${subscriptionId}` };
}

export function normalizeGoogleMock(
  state: GoogleMockState,
  previous: Subscription | undefined,
  now: Date,
) {
  const next = subscriptionSchema.parse({
    userId: state.userId,
    provider: 'google_mock',
    providerSubscriptionId: state.subscriptionId,
    productId: 'premium_monthly',
    state: state.status,
    providerStatus: state.status,
    accessUntil: state.accessUntil,
    graceUntil: state.graceUntil,
    cancelAtPeriodEnd: state.cancelAtPeriodEnd,
    verifiedAt: now.toISOString(),
    revision: (previous?.revision ?? 0) + 1,
  });
  if (previous && sameDomainState(previous, next)) {
    next.revision = previous.revision;
  }

  return next;
}

export class GoogleMockSource {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  async read(
    userId: string,
    subscriptionId: string,
  ): Promise<GoogleMockState | undefined> {
    const key = mockKey(userId, subscriptionId);
    const item = (
      await this.client.send(
        new GetCommand({
          TableName: this.tableName,
          Key: key,
          ConsistentRead: true,
        }),
      )
    ).Item;
    if (!item) {
      return undefined;
    }

    const parsed = stateSchema.safeParse(item);
    if (
      !parsed.success ||
      parsed.data.userId !== userId ||
      parsed.data.subscriptionId !== subscriptionId
    ) {
      throw new ProcessingError('google_mock_state_invalid');
    }

    const owner = (
      await this.client.send(
        new GetCommand({
          TableName: this.tableName,
          Key: {
            pk: `PROVIDER#google_mock#SUB#${subscriptionId}`,
            sk: 'OWNER',
          },
          ConsistentRead: true,
        }),
      )
    ).Item;
    if (owner?.userId !== userId) {
      throw new ProcessingError('google_mock_owner_mismatch');
    }

    return parsed.data;
  }

  async *list(userId: string) {
    let cursor: QueryCommandInput['ExclusiveStartKey'];
    do {
      const page = await this.client.send(
        new QueryCommand({
          TableName: this.tableName,
          ConsistentRead: true,
          KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
          ExpressionAttributeValues: {
            ':pk': mockKey(userId, '').pk,
            ':prefix': 'SUB#',
          },
          ...(cursor ? { ExclusiveStartKey: cursor } : {}),
        }),
      );
      for (const item of page.Items ?? []) {
        const parsed = stateSchema.safeParse(item);
        if (
          !parsed.success ||
          parsed.data.userId !== userId ||
          item.sk !== `SUB#${parsed.data.subscriptionId}`
        ) {
          throw new ProcessingError('google_mock_state_invalid');
        }

        yield parsed.data;
      }

      cursor = page.LastEvaluatedKey;
    } while (cursor);
  }

  async set(
    userId: string,
    subscriptionId: string,
    scenario: (typeof mockScenarios)[number],
    now: Date,
    until?: string,
  ) {
    z.uuid().parse(userId);
    googleMockIdSchema.parse(subscriptionId);
    const previous = await this.read(userId, subscriptionId);
    if (
      ['renewal_failed', 'canceling'].includes(scenario) &&
      !previous?.accessUntil
    ) {
      throw new Error(
        'Create an active mock period before simulating renewal failure or cancellation.',
      );
    }

    if (
      until &&
      (scenario !== 'active' ||
        !z.iso.datetime().safeParse(until).success ||
        Date.parse(until) <= now.getTime())
    ) {
      throw new Error('--until requires active and a future UTC timestamp.');
    }

    const accessUntil =
      scenario === 'active'
        ? (until ?? new Date(now.getTime() + 3_600_000).toISOString())
        : scenario === 'pending'
          ? null
          : (previous?.accessUntil ?? null);
    const state = stateSchema.parse({
      userId,
      subscriptionId,
      status:
        scenario === 'canceling'
          ? 'active'
          : scenario === 'renewal_failed'
            ? 'past_due'
            : scenario,
      accessUntil,
      graceUntil:
        scenario === 'renewal_failed' && accessUntil
          ? new Date(Date.parse(accessUntil) + GRACE_MS).toISOString()
          : null,
      cancelAtPeriodEnd: scenario === 'canceling',
      revision: (previous?.revision ?? 0) + 1,
      updatedAt: now.toISOString(),
    });
    await this.client.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            ConditionCheck: {
              TableName: this.tableName,
              Key: { pk: `USER#${userId}`, sk: 'PROFILE' },
              ConditionExpression: 'userId = :user',
              ExpressionAttributeValues: { ':user': userId },
            },
          },
          {
            Put: {
              TableName: this.tableName,
              Item: {
                pk: `PROVIDER#google_mock#SUB#${subscriptionId}`,
                sk: 'OWNER',
                userId,
              },
              ConditionExpression: 'attribute_not_exists(pk) OR userId = :user',
              ExpressionAttributeValues: { ':user': userId },
            },
          },
          {
            Put: {
              TableName: this.tableName,
              Item: { ...mockKey(userId, subscriptionId), ...state },
              ConditionExpression: previous
                ? 'revision = :revision AND userId = :user'
                : 'attribute_not_exists(pk)',
              ...(previous
                ? {
                    ExpressionAttributeValues: {
                      ':revision': previous.revision,
                      ':user': userId,
                    },
                  }
                : {}),
            },
          },
        ],
      }),
    );
    const eventId = randomUUID();
    const job: GoogleMockJob = {
      provider: 'google_mock',
      eventId,
      eventType: 'notification',
      userId,
      subscriptionId,
      correlationId: eventId,
      receivedAt: now.toISOString(),
    };
    return { state, job };
  }
}
