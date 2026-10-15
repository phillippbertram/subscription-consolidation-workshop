import { createHash, randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import type { UserIdentity, UserProfile, UserStore } from './users.js';

export class DynamoDbUserStore implements UserStore {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async getOrCreate(identity: UserIdentity): Promise<UserProfile> {
    const identityHash = createHash('sha256')
      .update(JSON.stringify([identity.issuer, identity.subject]))
      .digest('hex');
    const identityKey = { pk: `IDENTITY#${identityHash}`, sk: 'MAP' };

    // A losing first request reads the winner; it never overwrites the mapping.
    // Retry up to 5 times to handle possible race conditions when multiple requests try
    // to concurrently create the same identity mapping. Only one should succeed in the
    // atomic transaction; others will find it on their next loop. This prevents duplicate users.
    for (let attempt = 0; attempt < 5; attempt++) {
      const { Item: mapping } = await this.client.send(
        new GetCommand({
          TableName: this.tableName,
          Key: identityKey,
          ConsistentRead: true,
        }),
      );
      if (mapping) {
        if (
          mapping.issuer !== identity.issuer ||
          mapping.subject !== identity.subject ||
          typeof mapping.userId !== 'string'
        ) {
          throw new Error('Stored identity mapping is inconsistent.');
        }

        const { Item: profile } = await this.client.send(
          new GetCommand({
            TableName: this.tableName,
            Key: { pk: `USER#${mapping.userId}`, sk: 'PROFILE' },
            ConsistentRead: true,
          }),
        );
        if (
          !profile ||
          profile.identityHash !== identityHash ||
          profile.userId !== mapping.userId ||
          typeof profile.createdAt !== 'string'
        ) {
          throw new Error('Stored user profile is inconsistent.');
        }

        return { userId: mapping.userId, createdAt: profile.createdAt };
      }

      const profile: UserProfile = {
        userId: randomUUID(),
        createdAt: this.now().toISOString(),
      };
      try {
        await this.client.send(
          new TransactWriteCommand({
            ClientRequestToken: randomUUID(),
            TransactItems: [
              {
                Put: {
                  TableName: this.tableName,
                  Item: { ...identityKey, ...identity, userId: profile.userId },
                  ConditionExpression: 'attribute_not_exists(pk)',
                },
              },
              {
                Put: {
                  TableName: this.tableName,
                  Item: {
                    pk: `USER#${profile.userId}`,
                    sk: 'PROFILE',
                    identityHash,
                    ...profile,
                  },
                  ConditionExpression: 'attribute_not_exists(pk)',
                },
              },
            ],
          }),
        );
        return profile;
      } catch (error) {
        const reasons =
          error instanceof TransactionCanceledException
            ? error.CancellationReasons
            : undefined;
        const retryable =
          reasons?.some((reason) =>
            ['ConditionalCheckFailed', 'TransactionConflict'].includes(
              reason.Code ?? '',
            ),
          ) &&
          reasons.every((reason) =>
            ['None', 'ConditionalCheckFailed', 'TransactionConflict'].includes(
              reason.Code ?? 'None',
            ),
          );
        if (!retryable || attempt === 4) {
          throw error;
        }

        await setTimeout(25 * 2 ** attempt + Math.random() * 25);
      }
    }

    throw new Error('User creation did not complete.');
  }
}
