import { randomUUID } from 'node:crypto';
import {
  ConditionalCheckFailedException,
  TransactionCanceledException,
} from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import {
  attemptSchema,
  customerSchema,
  type BillingStore,
  type CheckoutAttempt,
  type CustomerMapping,
} from './contracts.js';

function conflict(error: unknown) {
  if (error instanceof ConditionalCheckFailedException) {
    return true;
  }

  return (
    error instanceof TransactionCanceledException &&
    Boolean(
      error.CancellationReasons?.some(
        (r) => r.Code === 'ConditionalCheckFailed',
      ),
    ) &&
    error.CancellationReasons?.every((r) =>
      ['None', 'ConditionalCheckFailed'].includes(r.Code ?? 'None'),
    )
  );
}

export class DynamoDbBillingStore implements BillingStore {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly table: string,
  ) {}

  /**
   * Read a committed checkout record by its exact key; absence is undefined.
   * Callers validate its schema and ownership, while storage failures propagate.
   */
  private async read(pk: string, sk: string) {
    return (
      await this.client.send(
        new GetCommand({
          TableName: this.table,
          Key: { pk, sk },
          ConsistentRead: true,
        }),
      )
    ).Item;
  }

  async getCustomer(userId: string) {
    const item = await this.read(`USER#${userId}`, 'CUSTOMER#stripe');
    if (!item) {
      return null;
    }

    const mapping = customerSchema.parse(item);
    if (mapping.userId !== userId) {
      throw new Error('Stored customer owner mismatch.');
    }

    return mapping;
  }

  async reserveCustomer(userId: string, now: number) {
    const key = { pk: `USER#${userId}`, sk: 'CUSTOMER#stripe' };
    const current = await this.read(key.pk, key.sk);
    if (current) {
      const mapping = customerSchema.parse(current);
      if (mapping.userId !== userId) {
        throw new Error('Stored customer owner mismatch.');
      }

      return mapping;
    }

    const candidate = { userId, requestId: randomUUID(), createdAt: now };
    try {
      await this.client.send(
        new PutCommand({
          TableName: this.table,
          Item: { ...key, ...candidate },
          ConditionExpression: 'attribute_not_exists(pk)',
        }),
      );
      return candidate;
    } catch (error) {
      if (!conflict(error)) {
        throw error;
      }

      const mapping = customerSchema.parse(await this.read(key.pk, key.sk));
      if (mapping.userId !== userId) {
        throw new Error('Stored customer owner mismatch.', { cause: error });
      }

      return mapping;
    }
  }

  async saveCustomer(mapping: CustomerMapping, customerId: string) {
    await this.client.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: this.table,
              Item: {
                pk: `USER#${mapping.userId}`,
                sk: 'CUSTOMER#stripe',
                ...mapping,
                customerId,
              },
              ConditionExpression:
                'requestId = :request AND (attribute_not_exists(customerId) OR customerId = :customer)',
              ExpressionAttributeValues: {
                ':request': mapping.requestId,
                ':customer': customerId,
              },
            },
          },
          {
            Put: {
              TableName: this.table,
              Item: {
                pk: `PROVIDER#stripe#CUSTOMER#${customerId}`,
                sk: 'OWNER',
                userId: mapping.userId,
                customerId,
              },
              ConditionExpression: 'attribute_not_exists(pk) OR userId = :user',
              ExpressionAttributeValues: { ':user': mapping.userId },
            },
          },
        ],
      }),
    );
  }

  async getCustomerOwner(customerId: string) {
    const item = await this.read(
      `PROVIDER#stripe#CUSTOMER#${customerId}`,
      'OWNER',
    );
    if (!item) {
      return null;
    }

    const owner = z
      .object({ userId: z.uuid(), customerId: z.literal(customerId) })
      .parse(item);
    return owner.userId;
  }

  async getAttempt(userId: string, requestId: string) {
    const item = await this.read(`CHECKOUT#${userId}#${requestId}`, 'REQUEST');
    if (!item) {
      return null;
    }

    const attempt = attemptSchema.parse(item);
    if (attempt.userId !== userId || attempt.requestId !== requestId) {
      throw new Error('Stored checkout owner mismatch.');
    }

    return attempt;
  }

  async getActiveAttemptId(userId: string) {
    const item = await this.read(`USER#${userId}`, 'CHECKOUT#ACTIVE');
    if (!item) {
      return null;
    }

    return z
      .object({ userId: z.literal(userId), requestId: z.uuid() })
      .parse(item).requestId;
  }

  async reserveAttempt(attempt: CheckoutAttempt, previousId: string | null) {
    try {
      await this.client.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Put: {
                TableName: this.table,
                Item: {
                  pk: `CHECKOUT#${attempt.userId}#${attempt.requestId}`,
                  sk: 'REQUEST',
                  ...attempt,
                },
                ConditionExpression: 'attribute_not_exists(pk)',
              },
            },
            {
              Put: {
                TableName: this.table,
                Item: {
                  pk: `USER#${attempt.userId}`,
                  sk: 'CHECKOUT#ACTIVE',
                  userId: attempt.userId,
                  requestId: attempt.requestId,
                },
                ConditionExpression: previousId
                  ? 'requestId = :previous'
                  : 'attribute_not_exists(pk)',
                ...(previousId
                  ? { ExpressionAttributeValues: { ':previous': previousId } }
                  : {}),
              },
            },
          ],
        }),
      );
      return true;
    } catch (error) {
      if (conflict(error)) {
        return false;
      }

      throw error;
    }
  }

  async saveSession(attempt: CheckoutAttempt, sessionId: string) {
    await this.client.send(
      new PutCommand({
        TableName: this.table,
        Item: {
          pk: `CHECKOUT#${attempt.userId}#${attempt.requestId}`,
          sk: 'REQUEST',
          ...attempt,
          sessionId,
        },
        ConditionExpression:
          'fingerprint = :fingerprint AND (attribute_not_exists(sessionId) OR sessionId = :session)',
        ExpressionAttributeValues: {
          ':fingerprint': attempt.fingerprint,
          ':session': sessionId,
        },
      }),
    );
  }
}
