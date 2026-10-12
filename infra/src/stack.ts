import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import {
  CfnOutput,
  CfnParameter,
  Duration,
  RemovalPolicy,
  Stack,
  type StackProps,
} from 'aws-cdk-lib';
import { HttpApi, HttpMethod, HttpStage } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { AttributeType, BillingMode, Table } from 'aws-cdk-lib/aws-dynamodb';
import { PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Queue, QueueEncryption } from 'aws-cdk-lib/aws-sqs';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import type { Construct } from 'constructs';

export class PremiumPassStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    const root = fileURLToPath(new URL('../../', import.meta.url));
    const issuer = new CfnParameter(this, 'Auth0Issuer', {
      type: 'String',
      description: 'Exact HTTPS Auth0 issuer, including its trailing slash.',
      allowedPattern: '^https://[a-zA-Z0-9.-]+/$',
    });
    const audience = new CfnParameter(this, 'Auth0Audience', {
      type: 'String',
      description:
        'Auth0 Custom API identifier, never an application client ID.',
      allowedPattern: '^\\S+$',
    });
    const table = new Table(this, 'Data', {
      partitionKey: { name: 'pk', type: AttributeType.STRING },
      sortKey: { name: 'sk', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    const secretArn = new CfnParameter(this, 'StripeSecretArn', {
      type: 'String',
      noEcho: true,
      description:
        'Existing Secrets Manager JSON secret: secretKey (sk_test_), priceId, webhookSecret. No secret value in CloudFormation.',
      allowedPattern: '^arn:[^:]+:secretsmanager:[^:]+:[0-9]{12}:secret:.+$',
    });
    const stripeSecret = Secret.fromSecretCompleteArn(
      this,
      'StripeSecret',
      secretArn.valueAsString,
    );
    const dlq = new Queue(this, 'SubscriptionDlq', {
      encryption: QueueEncryption.SQS_MANAGED,
      retentionPeriod: Duration.days(14),
      removalPolicy: RemovalPolicy.RETAIN,
    });
    const queue = new Queue(this, 'SubscriptionQueue', {
      encryption: QueueEncryption.SQS_MANAGED,
      visibilityTimeout: Duration.seconds(360),
      retentionPeriod: Duration.days(4),
      deadLetterQueue: { queue: dlq, maxReceiveCount: 5 },
      removalPolicy: RemovalPolicy.RETAIN,
    });
    const processingFunction = (
      id: string,
      entry: string,
      timeout: number,
      description: string,
    ) => {
      const logGroup = new LogGroup(this, `${id}Logs`, {
        retention: RetentionDays.ONE_WEEK,
        removalPolicy: RemovalPolicy.DESTROY,
      });
      const fn = new NodejsFunction(this, id, {
        description,
        entry: resolve(root, `services/${entry}`),
        depsLockFilePath: resolve(root, 'pnpm-lock.yaml'),
        projectRoot: root,
        runtime: Runtime.NODEJS_24_X,
        handler: 'handler',
        memorySize: 256,
        timeout: Duration.seconds(timeout),
        reservedConcurrentExecutions: 2,
        logGroup,
        environment: {
          SUBSCRIPTION_QUEUE_URL: queue.queueUrl,
          STRIPE_SECRET_ARN: secretArn.valueAsString,
        },
        bundling: {
          format: OutputFormat.ESM,
          target: 'node24',
          externalModules: [],
          banner:
            "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
        },
      });
      stripeSecret.grantRead(fn);
      return fn;
    };
    const webhook = processingFunction(
      'StripeWebhook',
      'stripe-webhook/src/lambda.ts',
      20,
      'Verifies Stripe webhook signatures and enqueues supported billing events in SQS.',
    );
    queue.grantSendMessages(webhook);
    const worker = processingFunction(
      'SubscriptionWorker',
      'subscription-worker/src/lambda.ts',
      60,
      'Processes queued Stripe events and atomically persists subscriptions, entitlements, completion markers, and outbox records.',
    );
    worker.addEnvironment('DYNAMODB_TABLE_NAME', table.tableName);
    worker.addEventSource(
      new SqsEventSource(queue, {
        batchSize: 1,
        maxConcurrency: 2,
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
        conditions: {
          'ForAllValues:StringLike': {
            'dynamodb:LeadingKeys': [
              'USER#*',
              'PROVIDER#stripe#*',
              'EVENT#stripe#*',
              'OUTBOX#*',
            ],
          },
        },
      }),
    );
    const logs = new LogGroup(this, 'BffLogs', {
      retention: RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    const role = new Role(this, 'BffRole', {
      assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
    });
    logs.grantWrite(role);
    // Transactional puts use PutItem IAM permission; no scan/update/delete grant.
    role.addToPolicy(
      new PolicyStatement({
        actions: ['dynamodb:GetItem', 'dynamodb:PutItem'],
        resources: [table.tableArn],
        conditions: {
          'ForAllValues:StringLike': {
            'dynamodb:LeadingKeys': ['IDENTITY#*', 'USER#*'],
          },
        },
      }),
    );
    role.addToPolicy(
      new PolicyStatement({
        actions: ['dynamodb:Query'],
        resources: [table.tableArn],
        conditions: {
          'ForAllValues:StringLike': { 'dynamodb:LeadingKeys': ['USER#*'] },
        },
      }),
    );
    const bff = new NodejsFunction(this, 'Bff', {
      description:
        'Serves the PremiumPass API with Auth0 token verification, user profiles, subscription status, and entitlement-protected demo data.',
      entry: resolve(root, 'services/bff/src/lambda.ts'),
      depsLockFilePath: resolve(root, 'pnpm-lock.yaml'),
      projectRoot: root,
      runtime: Runtime.NODEJS_24_X,
      handler: 'handler',
      memorySize: 256,
      timeout: Duration.seconds(20),
      reservedConcurrentExecutions: 2,
      role,
      logGroup: logs,
      environment: {
        AUTH0_ISSUER: issuer.valueAsString,
        AUTH0_AUDIENCE: audience.valueAsString,
        DYNAMODB_TABLE_NAME: table.tableName,
      },
      bundling: {
        format: OutputFormat.ESM,
        target: 'node24',
        externalModules: [],
        banner:
          "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
      },
    });
    const api = new HttpApi(this, 'Api', {
      createDefaultStage: false,
      defaultIntegration: new HttpLambdaIntegration('BffIntegration', bff),
    });
    // The only explicit route has a separate signature-authenticated transport.
    // All user API routes still use the BFF's $default integration and Auth0 checks.
    api.addRoutes({
      path: '/v1/webhooks/stripe',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration(
        'StripeWebhookIntegration',
        webhook,
      ),
    });
    new HttpStage(this, 'Stage', {
      httpApi: api,
      stageName: '$default',
      autoDeploy: true,
      throttle: { rateLimit: 10, burstLimit: 20 },
    });
    new CfnOutput(this, 'ApiUrl', { value: api.apiEndpoint });
    new CfnOutput(this, 'TableName', { value: table.tableName });
    new CfnOutput(this, 'BffLogGroupName', { value: logs.logGroupName });
    new CfnOutput(this, 'StripeWebhookUrl', {
      value: `${api.apiEndpoint}/v1/webhooks/stripe`,
    });
    new CfnOutput(this, 'SubscriptionQueueUrl', { value: queue.queueUrl });
    new CfnOutput(this, 'SubscriptionDlqUrl', { value: dlq.queueUrl });
  }
}
