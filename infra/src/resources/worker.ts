import { PolicyStatement, CfnPolicy } from 'aws-cdk-lib/aws-iam';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import type { Table } from 'aws-cdk-lib/aws-dynamodb';
import type { ISecret } from 'aws-cdk-lib/aws-secretsmanager';
import type { Queue } from 'aws-cdk-lib/aws-sqs';
import type { Construct } from 'constructs';
import {
  createServiceFunction,
  reservedConcurrency,
  workerTimeout,
} from './lambda.js';
import type { AppleParameters, GoogleParameters } from './parameters.js';
import { appleEnvironment, googleEnvironment } from './webhooks.js';

/**
 * The subscription worker: the only component that reads provider keys and
 * writes subscriptions. IAM limits it to the key families its stores use;
 * Apple and Google permissions exist only when that provider is enabled.
 */
export function createWorker(
  scope: Construct,
  {
    table,
    queue,
    stripeSecret,
    apple,
    google,
  }: {
    table: Table;
    queue: Queue;
    stripeSecret: ISecret;
    apple: AppleParameters;
    google: GoogleParameters;
  },
) {
  const worker = createServiceFunction(
    scope,
    'SubscriptionWorker',
    'subscription-worker',
    {
      description:
        'Processes queued Stripe, Apple Sandbox, and Google Play test events and atomically persists subscriptions, entitlements, completion markers, and outbox records.',
      timeout: workerTimeout,
      environment: {
        SUBSCRIPTION_QUEUE_URL: queue.queueUrl,
        DYNAMODB_TABLE_NAME: table.tableName,
        STRIPE_SECRET_ARN: stripeSecret.secretArn,
        ...appleEnvironment(apple),
        APPLE_SECRET_ARN: apple.secretArn,
        ...googleEnvironment(google),
        GOOGLE_PLAY_SECRET_ARN: google.secretArn,
      },
    },
  );
  stripeSecret.grantRead(worker);
  grantAppleSecret(scope, worker.role!.roleName, apple);
  grantGoogleProcessing(scope, worker.role!.roleName, table.tableArn, google);

  // Match polling concurrency to the Lambda reservation. Report failed records
  // explicitly so Lambda retries them instead of acknowledging the whole batch.
  worker.addEventSource(
    new SqsEventSource(queue, {
      batchSize: 1,
      maxConcurrency: reservedConcurrency,
      reportBatchItemFailures: true,
    }),
  );
  worker.addToRolePolicy(
    new PolicyStatement({
      actions: [
        'dynamodb:GetItem',
        'dynamodb:Query',
        'dynamodb:PutItem',
        'dynamodb:ConditionCheckItem',
      ],
      resources: [table.tableArn],
      // Optional defense in depth: restrict this role to processing key families,
      // excluding identity mappings. ForAllValues requires every requested pk
      // to match an allowed prefix. Keep this list aligned with store key formats.
      // This does not isolate users or sort keys; ownership checks stay in code.
      conditions: {
        'ForAllValues:StringLike': {
          'dynamodb:LeadingKeys': [
            'USER#*',
            'PROVIDER#stripe#*',
            'PROVIDER#apple#SUB#Sandbox:*',
            'EVENT#stripe#*',
            'EVENT#apple#Sandbox#*',
            'OUTBOX#*',
          ],
        },
      },
    }),
  );
  // Recording Apple's `finishedAt` is the only update; everything else is a put.
  worker.addToRolePolicy(
    new PolicyStatement({
      actions: ['dynamodb:UpdateItem'],
      resources: [table.tableArn],
      conditions: {
        'ForAllValues:StringLike': {
          'dynamodb:LeadingKeys': ['EVENT#apple#Sandbox#*'],
        },
      },
    }),
  );
  return worker;
}

// Only the worker reads the Apple private key. Omit the policy while Apple
// is disabled so an empty optional secret ARN creates no invalid IAM grant.
function grantAppleSecret(
  scope: Construct,
  roleName: string,
  apple: AppleParameters,
) {
  const policy = new CfnPolicy(scope, 'AppleWorkerSecretPolicy', {
    policyName: 'ReadAppleSandboxCredentials',
    roles: [roleName],
    policyDocument: {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Action: 'secretsmanager:GetSecretValue',
          Resource: apple.secretArn,
        },
      ],
    },
  });
  policy.cfnOptions.condition = apple.condition;
}

// Google needs its key plus its own record families; also omitted while disabled.
function grantGoogleProcessing(
  scope: Construct,
  roleName: string,
  tableArn: string,
  google: GoogleParameters,
) {
  const policy = new CfnPolicy(scope, 'GoogleWorkerPolicy', {
    policyName: 'ProcessGooglePlayTestPurchases',
    roles: [roleName],
    policyDocument: {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Action: 'secretsmanager:GetSecretValue',
          Resource: google.secretArn,
        },
        {
          Effect: 'Allow',
          Action: [
            'dynamodb:GetItem',
            'dynamodb:PutItem',
            'dynamodb:ConditionCheckItem',
          ],
          Resource: tableArn,
          // One transaction includes Google records and the shared user/outbox
          // keys. Keep every family here so the full transaction satisfies IAM.
          Condition: {
            'ForAllValues:StringLike': {
              'dynamodb:LeadingKeys': [
                'USER#*',
                'PROVIDER#google#SUB#*',
                'EVENT#google#*',
                'OUTBOX#*',
              ],
            },
          },
        },
        {
          Effect: 'Allow',
          Action: 'dynamodb:UpdateItem',
          Resource: tableArn,
          Condition: {
            'ForAllValues:StringLike': {
              'dynamodb:LeadingKeys': ['EVENT#google#*'],
            },
          },
        },
      ],
    },
  });
  policy.cfnOptions.condition = google.condition;
}
