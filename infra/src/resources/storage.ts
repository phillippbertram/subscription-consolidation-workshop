import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import { AttributeType, BillingMode, Table } from 'aws-cdk-lib/aws-dynamodb';
import { Queue, QueueEncryption } from 'aws-cdk-lib/aws-sqs';
import type { Construct } from 'constructs';
import { workerTimeout } from './lambda.js';

/**
 * The state of the system: one DynamoDB table and the worker's job queue.
 * All three resources are retained when the stack is deleted, so data and
 * failed jobs survive a teardown until someone removes them deliberately.
 */
export function createStorage(scope: Construct) {
  // Record types share one table and are distinguished by pk/sk prefixes.
  const table = new Table(scope, 'Data', {
    partitionKey: { name: 'pk', type: AttributeType.STRING },
    sortKey: { name: 'sk', type: AttributeType.STRING },
    billingMode: BillingMode.PAY_PER_REQUEST,
    removalPolicy: RemovalPolicy.RETAIN,
  });
  const dlq = new Queue(scope, 'SubscriptionDlq', {
    encryption: QueueEncryption.SQS_MANAGED,
    retentionPeriod: Duration.days(14),
    removalPolicy: RemovalPolicy.RETAIN,
  });
  // Visibility is six times the worker timeout, leaving room for retries.
  // Repeated failures move to the retained DLQ for inspection and redrive.
  const queue = new Queue(scope, 'SubscriptionQueue', {
    encryption: QueueEncryption.SQS_MANAGED,
    visibilityTimeout: Duration.seconds(workerTimeout.toSeconds() * 6),
    retentionPeriod: Duration.days(4),
    deadLetterQueue: { queue: dlq, maxReceiveCount: 5 },
    removalPolicy: RemovalPolicy.RETAIN,
  });
  return { table, queue, dlq };
}
