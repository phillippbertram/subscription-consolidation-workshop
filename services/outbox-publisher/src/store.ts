import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  ScanCommand,
  UpdateCommand,
  type ScanCommandInput,
} from '@aws-sdk/lib-dynamodb';
import {
  subscriptionChangedSchema,
  type SubscriptionChanged,
} from './events.js';

export interface OutboxPage {
  events: SubscriptionChanged[];
  invalid: number;
}

export interface OutboxStore {
  pending(): AsyncIterable<OutboxPage>;
  markSent(
    event: SubscriptionChanged,
    receipt: string,
    now: Date,
  ): Promise<boolean>;
}

export class DynamoDbOutboxStore implements OutboxStore {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string,
    private readonly pageSize = 100,
  ) {}

  async *pending(): AsyncGenerator<OutboxPage> {
    // A full-table scan keeps the small demo free of an extra index. Filtering
    // happens after reads, so it does not reduce read cost. For production volume,
    // choose an indexed pending-work access pattern and a sent-record retention policy.
    let cursor: ScanCommandInput['ExclusiveStartKey'];
    do {
      const page = await this.client.send(
        new ScanCommand({
          TableName: this.tableName,
          ConsistentRead: true,
          Limit: this.pageSize,
          ...(cursor ? { ExclusiveStartKey: cursor } : {}),
          FilterExpression:
            'begins_with(pk, :prefix) AND sk = :event AND #status = :pending',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: {
            ':prefix': 'OUTBOX#',
            ':event': 'EVENT',
            ':pending': 'pending',
          },
        }),
      );
      const events: SubscriptionChanged[] = [];
      let invalid = 0;
      for (const item of page.Items ?? []) {
        const parsed = subscriptionChangedSchema.safeParse(item);
        if (
          !parsed.success ||
          item.pk !== `OUTBOX#${parsed.data.domainEventId}`
        ) {
          invalid++;
          continue;
        }

        events.push(parsed.data);
      }

      yield { events, invalid };
      // An empty filtered page is not the end: only the cursor tells us whether
      // DynamoDB has more items to examine.
      cursor = page.LastEvaluatedKey;
    } while (cursor && Object.keys(cursor).length);
  }

  async markSent(event: SubscriptionChanged, receipt: string, now: Date) {
    const key = { pk: `OUTBOX#${event.domainEventId}`, sk: 'EVENT' };
    try {
      await this.client.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: key,
          UpdateExpression:
            'SET #status = :sent, sentAt = :now, publishedEventId = :receipt',
          ConditionExpression:
            '#status = :pending AND domainEventId = :id AND revision = :revision',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: {
            ':pending': 'pending',
            ':sent': 'sent',
            ':id': event.domainEventId,
            ':revision': event.revision,
            ':now': now.toISOString(),
            ':receipt': receipt,
          },
        }),
      );
      return true;
    } catch (error) {
      if (!(error instanceof ConditionalCheckFailedException)) {
        throw error;
      }

      const current = await this.client.send(
        new GetCommand({
          TableName: this.tableName,
          Key: key,
          ConsistentRead: true,
        }),
      );
      if (
        current.Item?.status === 'sent' &&
        current.Item.domainEventId === event.domainEventId
      ) {
        return false;
      }

      throw new Error('outbox_mark_conflict', { cause: error });
    }
  }
}
