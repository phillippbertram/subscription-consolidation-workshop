import { CfnOutput } from 'aws-cdk-lib';
import type { HttpApi } from 'aws-cdk-lib/aws-apigatewayv2';
import type { Table } from 'aws-cdk-lib/aws-dynamodb';
import type { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import type { Queue } from 'aws-cdk-lib/aws-sqs';
import type { Construct } from 'constructs';
import type { createReconciliation } from './reconciliation.js';

/** Values an operator needs after deployment: URLs to register, names to inspect. */
export function createOutputs(
  scope: Construct,
  {
    api,
    apiFunction,
    table,
    queue,
    dlq,
    reconciliation,
  }: {
    api: HttpApi;
    apiFunction: NodejsFunction;
    table: Table;
    queue: Queue;
    dlq: Queue;
    reconciliation: ReturnType<typeof createReconciliation>;
  },
) {
  new CfnOutput(scope, 'ApiUrl', { value: api.apiEndpoint });
  new CfnOutput(scope, 'TableName', { value: table.tableName });
  new CfnOutput(scope, 'ApiLogGroupName', {
    value: apiFunction.logGroup.logGroupName,
  });
  // Register these URLs with Stripe, Apple, and Google Pub/Sub.
  new CfnOutput(scope, 'StripeWebhookUrl', {
    value: `${api.apiEndpoint}/v1/webhooks/stripe`,
  });
  new CfnOutput(scope, 'AppleWebhookUrl', {
    value: `${api.apiEndpoint}/v1/webhooks/apple`,
  });
  new CfnOutput(scope, 'GoogleWebhookUrl', {
    value: `${api.apiEndpoint}/v1/webhooks/google`,
  });
  new CfnOutput(scope, 'SubscriptionQueueUrl', { value: queue.queueUrl });
  new CfnOutput(scope, 'SubscriptionDlqUrl', { value: dlq.queueUrl });
  new CfnOutput(scope, 'GoogleReconciliationFunctionName', {
    value: reconciliation.functions.google.functionName,
  });
  new CfnOutput(scope, 'StripeReconciliationFunctionName', {
    value: reconciliation.functions.stripe.functionName,
  });
  new CfnOutput(scope, 'AppleReconciliationFunctionName', {
    value: reconciliation.functions.apple.functionName,
  });
  new CfnOutput(scope, 'ReconciliationRuleName', {
    value: reconciliation.rule.ruleName,
  });
  new CfnOutput(scope, 'ReconciliationDlqUrl', {
    value: reconciliation.dlq.queueUrl,
  });
  // Keep the previous Google output names as aliases for existing operator scripts.
  new CfnOutput(scope, 'GoogleReconciliationRuleName', {
    value: reconciliation.rule.ruleName,
  });
  new CfnOutput(scope, 'GoogleReconciliationDlqUrl', {
    value: reconciliation.dlq.queueUrl,
  });
}
