export function readLocalConfig(env: NodeJS.ProcessEnv) {
  const rawPort = env.PORT;

  if (rawPort === undefined || rawPort.trim() === '') {
    throw new Error(
      'PORT is required for local startup. Set API_PORT in config/.env and run pnpm config:sync, or set PORT.',
    );
  }

  if (!/^\d+$/.test(rawPort) || Number(rawPort) > 65535) {
    throw new Error('PORT must be an integer between 0 and 65535.');
  }

  const hostname = env.HOST ?? '127.0.0.1';
  if (hostname !== '127.0.0.1' && hostname !== '0.0.0.0') {
    throw new Error('HOST must be 127.0.0.1 (default) or 0.0.0.0 (LAN).');
  }

  return { port: Number(rawPort), hostname };
}

/** Startup-validated values that fix which access tokens the API accepts. */
export interface AuthConfig {
  /** Exact HTTPS issuer with a trailing slash; also fixes the JWKS location. */
  issuer: string;
  /** Auth0 Custom API identifier used for audience validation. */
  audience: string;
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
