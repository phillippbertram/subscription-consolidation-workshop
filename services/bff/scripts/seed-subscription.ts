import {
  DynamoDBClient,
  TransactionCanceledException,
} from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import {
  GRACE_MS,
  subscriptionSchema,
  type Subscription,
} from '../src/domain/subscriptions.js';

const scenarios = [
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
const [userId, scenario, ...extra] = process.argv.slice(2);
if (
  !z.uuid().safeParse(userId).success ||
  !scenarios.includes(scenario as (typeof scenarios)[number]) ||
  extra.length
) {
  console.error(
    `Usage: pnpm demo:subscription <internal-user-id> <${scenarios.join('|')}>`,
  );
  process.exit(1);
}

// This educational writer is deliberately incapable of targeting AWS.
const client = new DynamoDBClient({
  endpoint: 'http://127.0.0.1:8000',
  region: 'us-east-1',
  credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
  maxAttempts: 1,
  requestHandler: { connectionTimeout: 1000, requestTimeout: 3000 },
});
const documentClient = DynamoDBDocumentClient.from(client);
const tableName = 'premiumpass-local';
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

try {
  const apple = record('apple_mock', changes);
  const google = record('google_mock', { accessUntil: at(2 * hour) });
  await documentClient.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          ConditionCheck: {
            TableName: tableName,
            Key: { pk, sk: 'PROFILE' },
            ConditionExpression: 'attribute_exists(pk) AND userId = :userId',
            ExpressionAttributeValues: { ':userId': userId },
          },
        },
        ...[apple, google].map((subscription) => {
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
          const keep =
            scenario !== 'free' &&
            (subscription.provider === 'apple_mock' || scenario === 'multiple');
          return keep
            ? {
                Put: {
                  ...common,
                  Item: { ...key, ...subscription, demoScenario: marker },
                },
              }
            : { Delete: { ...common, Key: key } };
        }),
      ],
    }),
  );
  console.info(
    `Applied ${scenario} to the two P05 demo records for ${userId}. Reload the app. Other subscriptions were preserved.`,
  );
  if (scenario === 'expiring')
    console.info(`Access expires at ${at(30_000)} without another event.`);
} catch (error) {
  const reasons =
    error instanceof TransactionCanceledException
      ? error.CancellationReasons
      : undefined;
  console.error(
    reasons?.[0]?.Code === 'ConditionalCheckFailed'
      ? 'This user profile does not exist in DynamoDB Local. Point the BFF at the Compose database, reload the app, and use the internal user ID shown there.'
      : reasons?.some((reason) => reason.Code === 'ConditionalCheckFailed')
        ? 'A reserved demo key contains an unmarked record. No data was changed.'
        : error instanceof Error
          ? error.message
          : 'Unable to seed the local scenario.',
  );
  process.exitCode = 1;
} finally {
  client.destroy();
}
