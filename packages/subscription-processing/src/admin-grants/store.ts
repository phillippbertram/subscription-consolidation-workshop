import { QueryCommand, type QueryCommandInput } from '@aws-sdk/lib-dynamodb';
import {
  ProcessingError,
  expirationDue,
  type Aggregate,
} from '../processing/contracts.js';
import type { DynamoDbProcessingStore } from '../processing/dynamodb-processing.js';
import {
  adminGrantAuditSchema,
  type AdminGrantAudit,
  type AdminGrantStore,
} from './contracts.js';

export class DynamoDbAdminGrantStore implements AdminGrantStore {
  constructor(private readonly processing: DynamoDbProcessingStore) {}

  async load(userId: string) {
    const profile = await this.processing.get(`USER#${userId}`, 'PROFILE');
    if (profile?.userId !== userId) {
      throw new ProcessingError('admin_grant_user_not_found');
    }

    return this.processing.load(userId);
  }

  async receipt(userId: string, requestId: string) {
    const item = await this.processing.get(
      `USER#${userId}`,
      `ADMIN_AUDIT#${requestId}`,
    );
    if (!item) {
      return null;
    }

    const audit = adminGrantAuditSchema.parse(item);
    if (audit.userId !== userId || audit.requestId !== requestId) {
      throw new Error('Admin audit ownership or key mismatch.');
    }

    return audit;
  }

  async commit(aggregate: Aggregate, audit: AdminGrantAudit, now: Date) {
    const { userId } = aggregate;
    const { requestId, after: next } = audit;
    const previous = aggregate.adminGrant;
    const key = { pk: `USER#${userId}`, sk: `ADMIN_AUDIT#${requestId}` };
    // Keep the receipt in the same transaction as access and the outbox: a lost
    // response must not leave an unrecorded grant that a retry could apply twice.
    await this.processing.commit(
      aggregate,
      aggregate.subscriptions,
      [
        ...(audit.outcome === 'changed' && next
          ? [
              {
                Put: {
                  TableName: this.processing.tableName,
                  Item: { pk: key.pk, sk: 'ADMIN_GRANT#premium', ...next },
                  ConditionExpression: previous
                    ? 'userId = :user AND revision = :revision'
                    : 'attribute_not_exists(pk)',
                  ...(previous
                    ? {
                        ExpressionAttributeValues: {
                          ':user': userId,
                          ':revision': previous.revision,
                        },
                      }
                    : {}),
                },
              },
            ]
          : []),
        {
          Put: {
            TableName: this.processing.tableName,
            Item: { ...key, ...audit },
            ConditionExpression: 'attribute_not_exists(pk)',
          },
        },
      ],
      now,
      audit.outcome === 'changed' || expirationDue(aggregate, now)
        ? { eventId: `admin:${requestId}`, correlationId: requestId }
        : undefined,
      next,
    );
  }

  async listAudit(userId: string) {
    const records: AdminGrantAudit[] = [];
    let cursor: QueryCommandInput['ExclusiveStartKey'];
    do {
      const page = await this.processing.client.send(
        new QueryCommand({
          TableName: this.processing.tableName,
          KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
          ExpressionAttributeValues: {
            ':pk': `USER#${userId}`,
            ':prefix': 'ADMIN_AUDIT#',
          },
          ConsistentRead: true,
          ...(cursor ? { ExclusiveStartKey: cursor } : {}),
        }),
      );
      for (const item of page.Items ?? []) {
        const record = adminGrantAuditSchema.parse(item);
        if (
          record.userId !== userId ||
          item.sk !== `ADMIN_AUDIT#${record.requestId}`
        ) {
          throw new Error('Admin audit ownership or key mismatch.');
        }

        records.push(record);
      }

      cursor = page.LastEvaluatedKey;
    } while (cursor);

    // Commit order stays deterministic when timestamps tie or the OS clock shifts.
    return records.sort((a, b) => a.aggregateRevision - b.aggregateRevision);
  }
}
