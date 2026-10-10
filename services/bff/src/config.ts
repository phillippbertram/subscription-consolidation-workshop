export function readLocalConfig(env: NodeJS.ProcessEnv) {
  const rawPort = env.PORT;

  if (rawPort === undefined || rawPort.trim() === '') {
    throw new Error(
      'PORT is required for local startup. Copy services/bff/.env.example to services/bff/.env or set PORT.',
    );
  }

  if (!/^\d+$/.test(rawPort) || Number(rawPort) > 65535) {
    throw new Error('PORT must be an integer between 0 and 65535.');
  }

  return { port: Number(rawPort), hostname: '127.0.0.1' };
}

export interface AuthConfig {
  issuer: string;
  audience: string;
}

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

export function readAuthConfig(env: NodeJS.ProcessEnv): AuthConfig {
  const issuer = env.AUTH0_ISSUER;
  const audience = env.AUTH0_AUDIENCE;

  if (!issuer || issuer.trim() !== issuer) {
    throw new Error(
      'AUTH0_ISSUER is required and must not contain surrounding whitespace.',
    );
  }

  let url: URL;
  try {
    url = new URL(issuer);
  } catch {
    throw new Error(
      'AUTH0_ISSUER must be an HTTPS origin with a trailing slash.',
    );
  }

  if (url.protocol !== 'https:' || issuer !== `${url.origin}/`) {
    throw new Error(
      'AUTH0_ISSUER must be an HTTPS origin with a trailing slash and no path, credentials, query, or fragment.',
    );
  }

  if (!audience || audience.trim() !== audience) {
    throw new Error(
      'AUTH0_AUDIENCE is required and must not contain surrounding whitespace. Use the Custom API identifier, not a client ID.',
    );
  }

  return { issuer, audience };
}
