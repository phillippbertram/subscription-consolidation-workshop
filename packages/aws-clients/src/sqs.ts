import { SQSClient } from '@aws-sdk/client-sqs';
import { LOCAL_SQS_ENDPOINT, localClientConfig } from './local.js';

export function createSqsClient(options: {
  local: boolean;
  requestTimeout?: number;
}) {
  return new SQSClient({
    maxAttempts: 2,
    requestHandler: {
      connectionTimeout: 1_000,
      // Allow the worker's ten-second long poll to complete.
      requestTimeout: options.requestTimeout ?? 15_000,
    },
    ...(options.local ? localClientConfig(LOCAL_SQS_ENDPOINT) : {}),
  });
}
