import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import {
  Aws,
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
import {
  CfnRule as CfnEventRule,
  Rule,
  Schedule,
} from 'aws-cdk-lib/aws-events';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import { SqsDestination } from 'aws-cdk-lib/aws-lambda-destinations';
import type { Construct } from 'constructs';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const workerTimeout = Duration.seconds(60);
const reservedConcurrency = 2;

export class PremiumPassStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    const {
      auth0,
      stripeSecret,
      apple,
      google,
      reconciliation: reconciliationSettings,
    } = createParameters(this);

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

    const googleEnvironment = {
      GOOGLE_PLAY_ENABLED: google.enabled,
      GOOGLE_PLAY_PACKAGE_NAME: google.packageName,
      GOOGLE_PLAY_PRODUCT_ID: google.productId,
      GOOGLE_PLAY_BASE_PLAN_ID: google.basePlanId,
    };
    // Authenticated Pub/Sub push uses Google's public signing keys. Ingress
    // only enqueues references; the worker alone may read the service-account key.
    const googleWebhook = createServiceFunction(
      this,
      'GoogleWebhook',
      'google-webhook',
      {
        description:
          'Authenticates Google Pub/Sub push identity and enqueues Google Play subscription references in SQS.',
        timeout: Duration.seconds(20),
        environment: {
          SUBSCRIPTION_QUEUE_URL: queue.queueUrl,
          ...googleEnvironment,
          GOOGLE_PLAY_PUSH_AUDIENCE: google.pushAudience,
          GOOGLE_PLAY_PUSH_SERVICE_ACCOUNT_EMAIL: google.pushEmail,
          GOOGLE_PLAY_PUSH_SUBSCRIPTION: google.pushSubscription,
        },
      },
    );
    queue.grantSendMessages(googleWebhook);

    const worker = createServiceFunction(
      this,
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
          ...appleEnvironment,
          APPLE_SECRET_ARN: apple.secretArn,
          ...googleEnvironment,
          GOOGLE_PLAY_SECRET_ARN: google.secretArn,
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

    const googleWorkerPolicy = new CfnPolicy(this, 'GoogleWorkerPolicy', {
      policyName: 'ProcessGooglePlayTestPurchases',
      roles: [worker.role!.roleName],
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
            Resource: table.tableArn,
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
            Resource: table.tableArn,
            Condition: {
              'ForAllValues:StringLike': {
                'dynamodb:LeadingKeys': ['EVENT#google#*'],
              },
            },
          },
        ],
      },
    });
    googleWorkerPolicy.cfnOptions.condition = google.condition;

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
    const apiFunction = createApiFunction(this, table, auth0, queue, google);
    const reconciliation = createReconciliation(
      this,
      table,
      queue,
      google,
      apple,
      stripeSecret.secretArn,
      reconciliationSettings,
    );

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
    api.addRoutes({
      path: '/v1/webhooks/google',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration(
        'GoogleWebhookIntegration',
        googleWebhook,
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
    new CfnOutput(this, 'GoogleWebhookUrl', {
      value: `${api.apiEndpoint}/v1/webhooks/google`,
    });
    new CfnOutput(this, 'SubscriptionQueueUrl', { value: queue.queueUrl });
    new CfnOutput(this, 'SubscriptionDlqUrl', { value: dlq.queueUrl });
    new CfnOutput(this, 'GoogleReconciliationFunctionName', {
      value: reconciliation.functions.google.functionName,
    });
    new CfnOutput(this, 'StripeReconciliationFunctionName', {
      value: reconciliation.functions.stripe.functionName,
    });
    new CfnOutput(this, 'AppleReconciliationFunctionName', {
      value: reconciliation.functions.apple.functionName,
    });
    new CfnOutput(this, 'ReconciliationRuleName', {
      value: reconciliation.rule.ruleName,
    });
    new CfnOutput(this, 'ReconciliationDlqUrl', {
      value: reconciliation.dlq.queueUrl,
    });
    // Keep the previous Google output names as aliases for existing operator scripts.
    new CfnOutput(this, 'GoogleReconciliationRuleName', {
      value: reconciliation.rule.ruleName,
    });
    new CfnOutput(this, 'GoogleReconciliationDlqUrl', {
      value: reconciliation.dlq.queueUrl,
    });
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
  const google = createGoogleParameters(scope);
  return {
    auth0: { issuer: issuer.valueAsString, audience: audience.valueAsString },
    stripeSecret,
    google,
    reconciliation: createReconciliationParameters(
      scope,
      appleEnabled.valueAsString,
      google.enabled,
    ),
    apple: {
      enabled: appleEnabled.valueAsString,
      bundleId: appleBundleId.valueAsString,
      productId: appleProductId.valueAsString,
      secretArn: appleSecretArn.valueAsString,
      condition: appleCondition,
    },
  };
}

function createGoogleParameters(scope: Construct) {
  const enabled = new CfnParameter(scope, 'GoogleEnabled', {
    type: 'String',
    default: 'false',
    allowedValues: ['true', 'false'],
    description:
      'Enable Google Play license-test API, notifications, and worker processing. Reconciliation has a separate opt-in.',
  });
  const packageName = new CfnParameter(scope, 'GooglePackageName', {
    type: 'String',
    default: '',
    allowedPattern: '^$|^[a-z][a-z0-9_]*(?:\\.[a-z][a-z0-9_]*)+$',
  });
  const productId = new CfnParameter(scope, 'GoogleProductId', {
    type: 'String',
    default: 'premium_monthly',
    allowedPattern: '^[a-z0-9][a-z0-9_.]{0,39}$',
  });
  const basePlanId = new CfnParameter(scope, 'GoogleBasePlanId', {
    type: 'String',
    default: 'monthly',
    allowedPattern: '^[a-z0-9][a-z0-9-]{0,62}$',
  });
  const secretArn = new CfnParameter(scope, 'GoogleSecretArn', {
    type: 'String',
    default: '',
    noEcho: true,
    allowedPattern: '^$|^arn:[^:]+:secretsmanager:[^:]+:[0-9]{12}:secret:.+$',
    description:
      'Existing Secrets Manager service-account JSON: type, client_email, private_key. Worker only.',
  });
  const pushAudience = new CfnParameter(scope, 'GooglePushAudience', {
    type: 'String',
    default: '',
    allowedPattern: '^$|^https://\\S+$',
    description:
      'Exact HTTPS audience configured on authenticated Pub/Sub push; may be a stable identifier independent of the endpoint.',
  });
  const pushEmail = new CfnParameter(scope, 'GooglePushServiceAccountEmail', {
    type: 'String',
    default: '',
    allowedPattern: '^$|^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$',
    description:
      'Expected verified email of the Pub/Sub push-auth service account.',
  });
  const pushSubscription = new CfnParameter(scope, 'GooglePushSubscription', {
    type: 'String',
    default: '',
    allowedPattern: '^$|^projects/[^/]+/subscriptions/[^/]+$',
  });
  const condition = new CfnCondition(scope, 'GoogleConfigured', {
    expression: Fn.conditionEquals(enabled.valueAsString, 'true'),
  });
  new CfnRule(scope, 'GoogleConfiguration', {
    ruleCondition: Fn.conditionEquals(enabled.valueAsString, 'true'),
    assertions: [
      {
        assert: Fn.conditionAnd(
          ...[
            packageName,
            secretArn,
            pushAudience,
            pushEmail,
            pushSubscription,
          ].map((parameter) =>
            Fn.conditionNot(Fn.conditionEquals(parameter.valueAsString, '')),
          ),
        ),
        assertDescription:
          'GoogleEnabled requires package, secret ARN, push audience, verified email, and subscription.',
      },
    ],
  });
  return {
    enabled: enabled.valueAsString,
    packageName: packageName.valueAsString,
    productId: productId.valueAsString,
    basePlanId: basePlanId.valueAsString,
    secretArn: secretArn.valueAsString,
    pushAudience: pushAudience.valueAsString,
    pushEmail: pushEmail.valueAsString,
    pushSubscription: pushSubscription.valueAsString,
    condition,
  };
}

type ServiceFunctionOptions = Pick<
  NodejsFunctionProps,
  | 'description'
  | 'timeout'
  | 'environment'
  | 'role'
  | 'logGroup'
  | 'entry'
  | 'reservedConcurrentExecutions'
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
    entry:
      options.entry ??
      resolve(repositoryRoot, `services/${service}/src/lambda.ts`),
    depsLockFilePath: resolve(repositoryRoot, 'pnpm-lock.yaml'),
    projectRoot: repositoryRoot,
    runtime: Runtime.NODEJS_24_X,
    handler: 'handler',
    memorySize: 256,
    reservedConcurrentExecutions:
      options.reservedConcurrentExecutions ?? reservedConcurrency,
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

function createReconciliationParameters(
  scope: Construct,
  appleEnabled: string,
  googleEnabled: string,
) {
  function provider(name: string, baseEnabled?: string) {
    const enabled = new CfnParameter(scope, `Reconciliation${name}Enabled`, {
      type: 'String',
      default: 'false',
      allowedValues: ['true', 'false'],
      description: `Enable ${name} discovery on the shared five-minute reconciliation schedule.`,
    });
    const condition = new CfnCondition(scope, `${name}ReconciliationEnabled`, {
      expression: Fn.conditionEquals(enabled.valueAsString, 'true'),
    });
    if (baseEnabled) {
      new CfnRule(scope, `${name}ReconciliationConfiguration`, {
        ruleCondition: Fn.conditionEquals(enabled.valueAsString, 'true'),
        assertions: [
          {
            assert: Fn.conditionEquals(baseEnabled, 'true'),
            assertDescription: `${name} reconciliation requires ${name} processing to be enabled.`,
          },
        ],
      });
    }

    return { enabled: enabled.valueAsString, condition };
  }

  return {
    stripe: provider('Stripe'),
    apple: provider('Apple', appleEnabled),
    google: provider('Google', googleEnabled),
  };
}

function createReconciliation(
  scope: Construct,
  table: Table,
  queue: Queue,
  google: ReturnType<typeof createGoogleParameters>,
  apple: ReturnType<typeof createParameters>['apple'],
  stripeSecretArn: string,
  settings: ReturnType<typeof createReconciliationParameters>,
) {
  // Preserve these existing construct IDs as their purpose expands to all providers.
  // Scheduler failures remain separate from purchase jobs in the worker DLQ.
  const dlq = new Queue(scope, 'GoogleReconciliationDlq', {
    encryption: QueueEncryption.SQS_MANAGED,
    retentionPeriod: Duration.days(14),
    removalPolicy: RemovalPolicy.RETAIN,
  });

  function discovery(
    provider: 'stripe' | 'apple' | 'google',
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
    google: discovery('google', 'GoogleReconciliation', {
      GOOGLE_PLAY_ENABLED: google.enabled,
      GOOGLE_PLAY_PACKAGE_NAME: google.packageName,
      GOOGLE_PLAY_PRODUCT_ID: google.productId,
      GOOGLE_PLAY_BASE_PLAN_ID: google.basePlanId,
    }),
  };
  const rule = new Rule(scope, 'GoogleReconciliationSchedule', {
    schedule: Schedule.rate(Duration.minutes(5)),
    enabled: false,
  });
  const providers = ['stripe', 'apple', 'google'] as const;
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
  return { functions, rule, dlq };
}

function createApiFunction(
  scope: Construct,
  table: Table,
  auth0: { issuer: string; audience: string },
  queue: Queue,
  google: ReturnType<typeof createGoogleParameters>,
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
  // The API submits references and polls ownership-bound completion markers.
  // Provider verification, secret reads, and completion writes stay in the worker.
  const googlePolicy = new CfnPolicy(scope, 'GoogleApiPolicy', {
    policyName: 'SubmitAndPollGooglePlayPurchases',
    roles: [role.roleName],
    policyDocument: {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Action: 'sqs:SendMessage',
          Resource: queue.queueArn,
        },
        {
          Effect: 'Allow',
          Action: 'dynamodb:GetItem',
          Resource: table.tableArn,
          Condition: {
            'ForAllValues:StringLike': {
              'dynamodb:LeadingKeys': ['EVENT#google#*'],
            },
          },
        },
      ],
    },
  });
  googlePolicy.cfnOptions.condition = google.condition;

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
      SUBSCRIPTION_QUEUE_URL: queue.queueUrl,
      GOOGLE_PLAY_ENABLED: google.enabled,
      GOOGLE_PLAY_PACKAGE_NAME: google.packageName,
      GOOGLE_PLAY_PRODUCT_ID: google.productId,
      GOOGLE_PLAY_BASE_PLAN_ID: google.basePlanId,
    },
  });
}
