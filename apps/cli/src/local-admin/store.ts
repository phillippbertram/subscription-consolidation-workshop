import { createDocumentClient } from '@premiumpass/aws-clients';
import { LOCAL_DATABASE_CONFIG } from '@premiumpass/persistence';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDbProcessingStore } from '@premiumpass/subscription-processing';
import { DynamoDbStripeStore } from '@premiumpass/subscription-processing/stripe/store';

export function createLocalSubscriptionStore() {
  const { tableName } = LOCAL_DATABASE_CONFIG;
  // Persistence stays fixed to Compose, even when reconciliation loads Stripe keys.
  const documentClient = createDocumentClient({
    ...LOCAL_DATABASE_CONFIG,
    maxAttempts: 1,
  });
  const store = new DynamoDbProcessingStore(documentClient, tableName);

  async function loadUser(userId: string) {
    const profile = await documentClient.send(
      new GetCommand({
        TableName: tableName,
        Key: { pk: `USER#${userId}`, sk: 'PROFILE' },
        ConsistentRead: true,
      }),
    );
    if (profile.Item?.userId !== userId) {
      throw new Error(
        'Local user not found. Sign in against the local API first.',
      );
    }

    return store.load(userId);
  }

  return {
    tableName,
    documentClient,
    store,
    stripeStore: new DynamoDbStripeStore(store),
    loadUser,
    close: () => documentClient.destroy(),
  };
}

export type LocalSubscriptionStore = ReturnType<
  typeof createLocalSubscriptionStore
>;
