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
import { HttpApi, HttpStage } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { AttributeType, BillingMode, Table } from 'aws-cdk-lib/aws-dynamodb';
import { PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
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
    new HttpStage(this, 'Stage', {
      httpApi: api,
      stageName: '$default',
      autoDeploy: true,
      throttle: { rateLimit: 10, burstLimit: 20 },
    });
    new CfnOutput(this, 'ApiUrl', { value: api.apiEndpoint });
    new CfnOutput(this, 'TableName', { value: table.tableName });
    new CfnOutput(this, 'BffLogGroupName', { value: logs.logGroupName });
  }
}
