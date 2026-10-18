import { resolve } from 'node:path';
import { Aws, CfnCondition, Duration, Fn, RemovalPolicy } from 'aws-cdk-lib';
import type { Table } from 'aws-cdk-lib/aws-dynamodb';
import {
  CfnRule as CfnEventRule,
  Rule,
  Schedule,
} from 'aws-cdk-lib/aws-events';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import { CfnPolicy } from 'aws-cdk-lib/aws-iam';
import { SqsDestination } from 'aws-cdk-lib/aws-lambda-destinations';
import { Queue, QueueEncryption } from 'aws-cdk-lib/aws-sqs';
import type { Construct } from 'constructs';
import { createServiceFunction, repositoryRoot } from './lambda.js';
import type {
  AppleParameters,
  GoogleParameters,
  ReconciliationParameters,
} from './parameters.js';
import { googleEnvironment } from './webhooks.js';

type Provider = 'stripe' | 'apple' | 'google';
const providers = ['stripe', 'apple', 'google'] as const;

/**
 * Scheduled repair of missed notifications.
 *
 * One five-minute EventBridge rule calls one discovery Lambda per provider.
 * Discovery only scans known references and queues refresh jobs; the worker
 * verifies and writes. Each provider is a separate opt-in, and failures land
 * in their own queue instead of the worker DLQ.
 */
export function createReconciliation(
  scope: Construct,
  {
    table,
    queue,
    stripeSecretArn,
    apple,
    google,
    settings,
  }: {
    table: Table;
    queue: Queue;
    stripeSecretArn: string;
    apple: AppleParameters;
    google: GoogleParameters;
    settings: ReconciliationParameters;
  },
) {
  // Preserve these existing construct IDs as their purpose expands to all providers.
  // Scheduler failures remain separate from purchase jobs in the worker DLQ.
  const dlq = new Queue(scope, 'GoogleReconciliationDlq', {
    encryption: QueueEncryption.SQS_MANAGED,
    retentionPeriod: Duration.days(14),
    removalPolicy: RemovalPolicy.RETAIN,
  });

  function discovery(
    provider: Provider,
    id: string,
    environment: Record<string, string>,
  ) {
    const fn = createServiceFunction(scope, id, 'subscription-worker', {
      entry: resolve(
        repositoryRoot,
        'services/subscription-worker/src/reconciliation/lambda.ts',
      ),
      description: `Discovers ${provider} test subscription references and enqueues worker refresh jobs.`,
      timeout: Duration.seconds(60),
      reservedConcurrentExecutions: 1,
      environment: {
        DYNAMODB_TABLE_NAME: table.tableName,
        SUBSCRIPTION_QUEUE_URL: queue.queueUrl,
        RECONCILIATION_PROVIDER: provider,
        RECONCILIATION_ENABLED: settings[provider].enabled,
        ...environment,
      },
    });
    const statements: Record<string, unknown>[] = [
      // Scan filters/projections are code boundaries, not partition-level IAM restrictions.
      { Effect: 'Allow', Action: 'dynamodb:Scan', Resource: table.tableArn },
      { Effect: 'Allow', Action: 'sqs:SendMessage', Resource: queue.queueArn },
    ];
    if (provider === 'stripe') {
      // Stripe must list customer subscriptions to recover a missed initial webhook.
      // This role can read ownership/aggregate state and its Stripe test secret, never write.
      statements.push(
        {
          Effect: 'Allow',
          Action: ['dynamodb:GetItem', 'dynamodb:Query'],
          Resource: table.tableArn,
          Condition: {
            'ForAllValues:StringLike': {
              'dynamodb:LeadingKeys': ['USER#*', 'PROVIDER#stripe#CUSTOMER#*'],
            },
          },
        },
        {
          Effect: 'Allow',
          Action: 'secretsmanager:GetSecretValue',
          Resource: stripeSecretArn,
        },
      );
    }

    const policy = new CfnPolicy(scope, `${id}Policy`, {
      policyName: `Discover${id}`,
      roles: [fn.role!.roleName],
      policyDocument: { Version: '2012-10-17', Statement: statements },
    });
    policy.cfnOptions.condition = settings[provider].condition;
    fn.configureAsyncInvoke({
      retryAttempts: 2,
      maxEventAge: Duration.hours(1),
      onFailure: new SqsDestination(dlq),
    });
    return fn;
  }

  const functions = {
    stripe: discovery('stripe', 'StripeReconciliation', {
      STRIPE_SECRET_ARN: stripeSecretArn,
    }),
    apple: discovery('apple', 'AppleReconciliation', {
      APPLE_ENABLED: apple.enabled,
    }),
    google: discovery(
      'google',
      'GoogleReconciliation',
      googleEnvironment(google),
    ),
  };
  const rule = new Rule(scope, 'GoogleReconciliationSchedule', {
    schedule: Schedule.rate(Duration.minutes(5)),
    enabled: false,
  });
  for (const provider of providers) {
    // Binding installs source-ARN-scoped invocation permission and DLQ delivery policy.
    rule.addTarget(
      new LambdaFunction(functions[provider], {
        retryAttempts: 2,
        maxEventAge: Duration.hours(1),
        deadLetterQueue: dlq,
      }),
    );
  }

  enableOnlySelectedTargets(scope, { rule, functions, dlq, settings });
  return { functions, rule, dlq };
}

/**
 * CDK targets are static, but the opt-ins are deployment parameters. Rewrite
 * the rule with CloudFormation conditions: it is enabled when any provider is,
 * and each disabled provider's target disappears from the rule.
 */
function enableOnlySelectedTargets(
  scope: Construct,
  {
    rule,
    functions,
    dlq,
    settings,
  }: {
    rule: Rule;
    functions: Record<Provider, { functionArn: string }>;
    dlq: Queue;
    settings: ReconciliationParameters;
  },
) {
  const anyEnabled = new CfnCondition(scope, 'ReconciliationEnabled', {
    expression: Fn.conditionOr(
      ...providers.map((provider) => settings[provider].condition),
    ),
  });
  const scheduledRule = rule.node.defaultChild as CfnEventRule;
  scheduledRule.state = Fn.conditionIf(
    anyEnabled.logicalId,
    'ENABLED',
    'DISABLED',
  ).toString();
  // Raw CloudFormation keys are needed inside Fn::If. AWS::NoValue removes each
  // disabled target, while the runtime flag also guards manual invocation.
  scheduledRule.addPropertyOverride(
    'Targets',
    providers.map((provider) =>
      Fn.conditionIf(
        settings[provider].condition.logicalId,
        {
          Id: provider,
          Arn: functions[provider].functionArn,
          DeadLetterConfig: { Arn: dlq.queueArn },
          RetryPolicy: {
            MaximumRetryAttempts: 2,
            MaximumEventAgeInSeconds: 3600,
          },
        },
        Aws.NO_VALUE,
      ),
    ),
  );
}
