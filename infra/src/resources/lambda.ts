import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import {
  NodejsFunction,
  OutputFormat,
  type NodejsFunctionProps,
} from 'aws-cdk-lib/aws-lambda-nodejs';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import type { Construct } from 'constructs';

export const repositoryRoot = fileURLToPath(
  new URL('../../../', import.meta.url),
);
export const workerTimeout = Duration.seconds(60);
export const reservedConcurrency = 2;

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

/**
 * Bundle one service's `src/lambda.ts` with shared runtime defaults.
 * Every Lambda gets its own one-week log group and a small concurrency
 * reservation; callers add the IAM permissions that function needs.
 */
export function createServiceFunction(
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
