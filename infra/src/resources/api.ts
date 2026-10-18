import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import { HttpApi, HttpMethod, HttpStage } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import type { Table } from 'aws-cdk-lib/aws-dynamodb';
import {
  CfnPolicy,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from 'aws-cdk-lib/aws-iam';
import type { IFunction } from 'aws-cdk-lib/aws-lambda';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import type { Queue } from 'aws-cdk-lib/aws-sqs';
import type { Construct } from 'constructs';
import { createServiceFunction } from './lambda.js';
import type { GoogleParameters, StackParameters } from './parameters.js';
import { googleEnvironment } from './webhooks.js';

/**
 * The API Lambda verifies Auth0 tokens itself and reads access from the table.
 * It may write only identity/profile records and, with Google enabled, submit
 * sync jobs and read Google completion markers. It never holds provider keys.
 */
export function createApiFunction(
  scope: Construct,
  {
    table,
    queue,
    auth0,
    google,
  }: {
    table: Table;
    queue: Queue;
    auth0: StackParameters['auth0'];
    google: GoogleParameters;
  },
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
      ...googleEnvironment(google),
    },
  });
}

/**
 * One HTTP API in front of everything. User routes fall through to the API
 * Lambda; explicit webhook routes go to their provider's Lambda.
 */
export function createHttpApi(
  scope: Construct,
  {
    apiFunction,
    webhooks,
  }: {
    apiFunction: IFunction;
    webhooks: { stripe: IFunction; apple: IFunction; google: IFunction };
  },
) {
  // Hono owns user routes and verifies Auth0 tokens/scopes inside the API Lambda.
  // Gateway only selects the Lambda; no JWT or Lambda authorizer is configured.
  const api = new HttpApi(scope, 'Api', {
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
      webhooks.stripe,
    ),
  });
  api.addRoutes({
    path: '/v1/webhooks/apple',
    methods: [HttpMethod.POST],
    integration: new HttpLambdaIntegration(
      'AppleWebhookIntegration',
      webhooks.apple,
    ),
  });
  api.addRoutes({
    path: '/v1/webhooks/google',
    methods: [HttpMethod.POST],
    integration: new HttpLambdaIntegration(
      'GoogleWebhookIntegration',
      webhooks.google,
    ),
  });
  // The stage exposes the routes and limits demo traffic; it is not an auth boundary.
  new HttpStage(scope, 'Stage', {
    httpApi: api,
    stageName: '$default',
    autoDeploy: true,
    throttle: { rateLimit: 10, burstLimit: 20 },
  });
  return api;
}
