export interface DatabaseConfig {
  tableName: string;
  endpoint?: string;
}

export function readDatabaseConfig(
  env: NodeJS.ProcessEnv,
  allowLocalEndpoint = false,
): DatabaseConfig {
  const tableName = env.DYNAMODB_TABLE_NAME;
  if (!tableName || !/^[a-zA-Z0-9_.-]{3,255}$/.test(tableName)) {
    throw new Error('DYNAMODB_TABLE_NAME must be a valid DynamoDB table name.');
  }
  const endpoint = env.DYNAMODB_ENDPOINT;
  if (endpoint !== undefined) {
    if (!allowLocalEndpoint) {
      throw new Error(
        'DYNAMODB_ENDPOINT is only supported by the local server.',
      );
    }
    const url = new URL(endpoint);
    if (
      url.protocol !== 'http:' ||
      !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
      endpoint !== url.origin
    ) {
      throw new Error(
        'DYNAMODB_ENDPOINT must be a loopback HTTP origin without a trailing slash.',
      );
    }
    return { tableName, endpoint };
  }
  return { tableName };
}
