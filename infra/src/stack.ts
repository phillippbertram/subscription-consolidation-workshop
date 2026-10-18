import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import {
  CfnCondition,
  CfnRule,
  Fn,
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
import {
  CfnPolicy,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from 'aws-cdk-lib/aws-iam';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import {
  NodejsFunction,
  OutputFormat,
  type NodejsFunctionProps,
} from 'aws-cdk-lib/aws-lambda-nodejs';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Queue, QueueEncryption } from 'aws-cdk-lib/aws-sqs';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import type { Construct } from 'constructs';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const workerTimeout = Duration.seconds(60);
const reservedConcurrency = 2;

export class PremiumPassStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    const { auth0, stripeSecret, apple } = createParameters(this);

    // Record types share one table and are distinguished by pk/sk prefixes.
    // Retain application data when the stack is deleted or the table replaced.
    const table = new Table(this, 'Data', {
      partitionKey: { name: 'pk', type: AttributeType.STRING },
      sortKey: { name: 'sk', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    const dlq = new Queue(this, 'SubscriptionDlq', {
      encryption: QueueEncryption.SQS_MANAGED,
      retentionPeriod: Duration.days(14),
      removalPolicy: RemovalPolicy.RETAIN,
    });
    // Visibility is six times the worker timeout, leaving room for retries.
    // Repeated failures move to the retained DLQ for inspection and redrive.
    const queue = new Queue(this, 'SubscriptionQueue', {
      encryption: QueueEncryption.SQS_MANAGED,
      visibilityTimeout: Duration.seconds(workerTimeout.toSeconds() * 6),
      retentionPeriod: Duration.days(4),
      deadLetterQueue: { queue: dlq, maxReceiveCount: 5 },
      removalPolicy: RemovalPolicy.RETAIN,
    });
    const stripeWebhook = createServiceFunction(
      this,
      'StripeWebhook',
      'stripe-webhook',
      {
        description:
          'Verifies Stripe webhook signatures and enqueues supported billing events in SQS.',
        timeout: Duration.seconds(20),
        environment: {
          SUBSCRIPTION_QUEUE_URL: queue.queueUrl,
          STRIPE_SECRET_ARN: stripeSecret.secretArn,
        },
      },
    );
    stripeSecret.grantRead(stripeWebhook);
    queue.grantSendMessages(stripeWebhook);

    const appleEnvironment = {
      APPLE_ENABLED: apple.enabled,
      APPLE_BUNDLE_ID: apple.bundleId,
      APPLE_PRODUCT_ID: apple.productId,
    };
    // Apple ingress verifies with public certificates: it needs queue-send
    // permission, but no private key, Stripe secret, or database access.
    const appleWebhook = createServiceFunction(
      this,
      'AppleWebhook',
      'apple-webhook',
      {
        description:
          'Verifies Apple Sandbox notifications and enqueues subscription references in SQS.',
        timeout: Duration.seconds(20),
        environment: {
          SUBSCRIPTION_QUEUE_URL: queue.queueUrl,
          ...appleEnvironment,
        },
      },
    );
    queue.grantSendMessages(appleWebhook);

    const worker = createServiceFunction(
      this,
      'SubscriptionWorker',
      'subscription-worker',
      {
        description:
          'Processes queued Stripe and Apple Sandbox events and atomically persists subscriptions, entitlements, completion markers, and outbox records.',
        timeout: workerTimeout,
        environment: {
          SUBSCRIPTION_QUEUE_URL: queue.queueUrl,
          DYNAMODB_TABLE_NAME: table.tableName,
          STRIPE_SECRET_ARN: stripeSecret.secretArn,
          ...appleEnvironment,
          APPLE_SECRET_ARN: apple.secretArn,
        },
      },
    );
    stripeSecret.grantRead(worker);
    // Only the worker reads the Apple private key. Omit the policy while Apple
    // is disabled so an empty optional secret ARN creates no invalid IAM grant.
    const appleSecretPolicy = new CfnPolicy(this, 'AppleWorkerSecretPolicy', {
      policyName: 'ReadAppleSandboxCredentials',
      roles: [worker.role!.roleName],
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
    appleSecretPolicy.cfnOptions.condition = apple.condition;

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
    const apiFunction = createApiFunction(this, table, auth0);

    // Hono owns user routes and verifies Auth0 tokens/scopes inside the API Lambda.
    // Gateway only selects the Lambda; no JWT or Lambda authorizer is configured.
    const api = new HttpApi(this, 'Api', {
      createDefaultStage: false,
      defaultIntegration: new HttpLambdaIntegration(
        'ApiIntegration',
        apiFunction,
      ),
    });
    // Webhooks have separate signature-authenticated transports.
    // All user API routes still use the API's $default integration and Auth0 checks.
    api.addRoutes({
      path: '/v1/webhooks/stripe',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration(
        'StripeWebhookIntegration',
        stripeWebhook,
      ),
    });
    api.addRoutes({
      path: '/v1/webhooks/apple',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration(
        'AppleWebhookIntegration',
        appleWebhook,
      ),
    });
    // The stage exposes the routes and limits demo traffic; it is not an auth boundary.
    new HttpStage(this, 'Stage', {
      httpApi: api,
      stageName: '$default',
      autoDeploy: true,
      throttle: { rateLimit: 10, burstLimit: 20 },
    });
    new CfnOutput(this, 'ApiUrl', { value: api.apiEndpoint });
    new CfnOutput(this, 'TableName', { value: table.tableName });
    new CfnOutput(this, 'ApiLogGroupName', {
      value: apiFunction.logGroup.logGroupName,
    });
    new CfnOutput(this, 'StripeWebhookUrl', {
      value: `${api.apiEndpoint}/v1/webhooks/stripe`,
    });
    new CfnOutput(this, 'AppleWebhookUrl', {
      value: `${api.apiEndpoint}/v1/webhooks/apple`,
    });
    new CfnOutput(this, 'SubscriptionQueueUrl', { value: queue.queueUrl });
    new CfnOutput(this, 'SubscriptionDlqUrl', { value: dlq.queueUrl });
  }
}

function createParameters(scope: Construct) {
  // Deployment parameters keep synthesis independent of an AWS account and
  // avoid loading local service configuration into the cloud template.
  const issuer = new CfnParameter(scope, 'Auth0Issuer', {
    type: 'String',
    description: 'Exact HTTPS Auth0 issuer, including its trailing slash.',
    allowedPattern: '^https://[a-zA-Z0-9.-]+/$',
  });
  const audience = new CfnParameter(scope, 'Auth0Audience', {
    type: 'String',
    description: 'Auth0 Custom API identifier, never an application client ID.',
    allowedPattern: '^\\S+$',
  });
  const secretArn = new CfnParameter(scope, 'StripeSecretArn', {
    type: 'String',
    noEcho: true,
    description:
      'Existing Secrets Manager JSON secret: secretKey (sk_test_), priceId, webhookSecret. No secret value in CloudFormation.',
    allowedPattern: '^arn:[^:]+:secretsmanager:[^:]+:[0-9]{12}:secret:.+$',
  });
  // Reference an existing secret; CDK never reads or embeds its contents.
  const stripeSecret = Secret.fromSecretCompleteArn(
    scope,
    'StripeSecret',
    secretArn.valueAsString,
  );
  const appleEnabled = new CfnParameter(scope, 'AppleEnabled', {
    type: 'String',
    default: 'false',
    allowedValues: ['true', 'false'],
    description:
      'Enable Apple Sandbox notification verification and worker processing.',
  });
  const appleBundleId = new CfnParameter(scope, 'AppleBundleId', {
    type: 'String',
    default: '',
    allowedPattern: '^$|^[A-Za-z0-9-]+(?:\\.[A-Za-z0-9-]+)+$',
    description: 'App Store bundle ID; required when Apple is enabled.',
  });
  const appleProductId = new CfnParameter(scope, 'AppleProductId', {
    type: 'String',
    default: 'premiumpass.premium.monthly.v2',
    allowedPattern: '^[A-Za-z0-9._-]{1,255}$',
  });
  const appleSecretArn = new CfnParameter(scope, 'AppleSecretArn', {
    type: 'String',
    default: '',
    noEcho: true,
    allowedPattern: '^$|^arn:[^:]+:secretsmanager:[^:]+:[0-9]{12}:secret:.+$',
    description:
      'Existing Secrets Manager JSON secret: keyId, issuerId, privateKey (P-256 PEM). Worker only.',
  });
  const appleCondition = new CfnCondition(scope, 'AppleConfigured', {
    expression: Fn.conditionEquals(appleEnabled.valueAsString, 'true'),
  });
  // Reject incomplete opt-in configuration even when deploying outside our CLI.
  new CfnRule(scope, 'AppleConfiguration', {
    ruleCondition: Fn.conditionEquals(appleEnabled.valueAsString, 'true'),
    assertions: [
      {
        assert: Fn.conditionAnd(
          Fn.conditionNot(Fn.conditionEquals(appleBundleId.valueAsString, '')),
          Fn.conditionNot(Fn.conditionEquals(appleSecretArn.valueAsString, '')),
        ),
        assertDescription:
          'AppleEnabled requires AppleBundleId and AppleSecretArn.',
      },
    ],
  });
  return {
    auth0: { issuer: issuer.valueAsString, audience: audience.valueAsString },
    stripeSecret,
    apple: {
      enabled: appleEnabled.valueAsString,
      bundleId: appleBundleId.valueAsString,
      productId: appleProductId.valueAsString,
      secretArn: appleSecretArn.valueAsString,
      condition: appleCondition,
    },
  };
}

type ServiceFunctionOptions = Pick<
  NodejsFunctionProps,
  'description' | 'timeout' | 'environment' | 'role' | 'logGroup'
>;

// Share runtime/bundling defaults across all Lambdas; callers own IAM grants.
function createServiceFunction(
  scope: Construct,
  id: string,
  service: string,
  options: ServiceFunctionOptions,
) {
  const logGroup =
    options.logGroup ??
    new LogGroup(scope, `${id}Logs`, {
      retention: RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY,
    });
  return new NodejsFunction(scope, id, {
    ...options,
    entry: resolve(repositoryRoot, `services/${service}/src/lambda.ts`),
    depsLockFilePath: resolve(repositoryRoot, 'pnpm-lock.yaml'),
    projectRoot: repositoryRoot,
    runtime: Runtime.NODEJS_24_X,
    handler: 'handler',
    memorySize: 256,
    reservedConcurrentExecutions: reservedConcurrency,
    logGroup,
    bundling: {
      format: OutputFormat.ESM,
      target: 'node24',
      externalModules: [],
      banner:
        "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
    },
  });
}

function createApiFunction(
  scope: Construct,
  table: Table,
  auth0: { issuer: string; audience: string },
) {
  const logs = new LogGroup(scope, 'ApiLogs', {
    retention: RetentionDays.ONE_WEEK,
    removalPolicy: RemovalPolicy.DESTROY,
  });
  const role = new Role(scope, 'ApiRole', {
    assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
  });
  logs.grantWrite(role);
  // Transactional puts use PutItem IAM permission; no scan/update/delete grant.
  // USER# includes profiles and subscriptions, so these prefixes alone cannot
  // prevent entitlement writes. The API's stores must enforce that boundary.
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
  // Subscription reads query one user's partition; identity lookup needs only GetItem.
  role.addToPolicy(
    new PolicyStatement({
      actions: ['dynamodb:Query'],
      resources: [table.tableArn],
      conditions: {
        'ForAllValues:StringLike': { 'dynamodb:LeadingKeys': ['USER#*'] },
      },
    }),
  );
  return createServiceFunction(scope, 'ApiFunction', 'api', {
    description:
      'Serves the PremiumPass API with Auth0 token verification, user profiles, subscription status, and entitlement-protected demo data.',
    timeout: Duration.seconds(20),
    role,
    logGroup: logs,
    environment: {
      AUTH0_ISSUER: auth0.issuer,
      AUTH0_AUDIENCE: auth0.audience,
      DYNAMODB_TABLE_NAME: table.tableName,
    },
  });
}
