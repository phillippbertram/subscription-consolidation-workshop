import type { Context } from 'hono';
import { createMiddleware } from 'hono/factory';
import {
  createRemoteJWKSet,
  customFetch,
  errors,
  jwtVerify,
  type JWTPayload,
  type JWTVerifyGetKey,
} from 'jose';
import type { AuthConfig } from './config.js';

/**
 * Claims exposed after access-token signature, issuer, audience and time checks.
 * This can still identify a machine; user routes reject machine identities
 * separately before resolving a profile.
 */
export interface AuthIdentity {
  issuer: string;
  subject: string;
  /** Verified API permissions; Premium also requires a current entitlement. */
  scopes: string[];
}

export type AppEnv = {
  Variables: {
    auth: AuthIdentity;
    requestId: string;
    machineIdentity: boolean;
  };
};

class KeyServiceUnavailableError extends Error {
  constructor() {
    super('Signing keys are temporarily unavailable.');
  }
}

/**
 * Verify the Auth0 access token before any user route runs.
 *
 * 1. Read a well-formed Bearer token from the Authorization header.
 * 2. Verify signature, issuer, audience, and expiry with Auth0's public keys.
 * 3. Only then trust the claims: subject, scopes, and machine/user identity.
 *
 * Invalid tokens get 401. If Auth0's keys cannot be fetched and none are
 * cached, the API answers 503 instead of guessing.
 */
export function authenticate(config: AuthConfig) {
  // One resolver per app instance: reused by local requests and warm Lambda invocations.
  const getSigningKey = createKeyResolver(config.issuer);

  return createMiddleware<AppEnv>(async (c, next) => {
    const token = readBearerToken(c.req.header('Authorization'));
    if (!token) {
      return unauthorized(c);
    }

    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(token, getSigningKey, {
        algorithms: ['RS256'],
        issuer: config.issuer,
        audience: config.audience,
        requiredClaims: ['iss', 'aud', 'exp', 'sub'],
        clockTolerance: 5,
      }));
    } catch (error) {
      if (error instanceof KeyServiceUnavailableError) {
        c.header('Retry-After', '30');
        return c.json(
          {
            error: {
              code: 'authentication_unavailable',
              requestId: c.get('requestId'),
            },
          },
          503,
        );
      }

      if (error instanceof errors.JOSEError) {
        return unauthorized(c);
      }

      throw error;
    }

    const verified = toIdentity(payload, config.issuer);
    if (!verified) {
      return unauthorized(c);
    }

    c.set('auth', verified.identity);
    c.set('machineIdentity', verified.machineIdentity);
    // Downstream errors must not be mistaken for authentication failures.
    await next();
  });
}

export function requireScopes(...required: string[]) {
  return createMiddleware<AppEnv>(async (c, next) => {
    if (!required.every((scope) => c.get('auth').scopes.includes(scope))) {
      c.header(
        'WWW-Authenticate',
        `Bearer error="insufficient_scope", scope="${required.join(' ')}"`,
      );
      return c.json(
        {
          error: { code: 'insufficient_scope', requestId: c.get('requestId') },
        },
        403,
      );
    }

    await next();
  });
}

/** Accept only `Bearer <header>.<payload>.<signature>` with a bounded size. */
function readBearerToken(authorization: string | undefined) {
  const match = authorization?.match(
    /^Bearer +([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i,
  );
  const token = match?.[1];
  if (!token || token.length > 16_384) {
    return null;
  }

  return token;
}

/**
 * Look up Auth0's public signing key for a token. The JWKS URL is fixed to
 * the configured issuer; URLs inside the token are never followed.
 */
function createKeyResolver(issuer: string): JWTVerifyGetKey {
  let nextFetchAt = 0;
  const jwks = createRemoteJWKSet(new URL('.well-known/jwks.json', issuer), {
    timeoutDuration: 5_000,
    cooldownDuration: 30_000,
    cacheMaxAge: 600_000,
    [customFetch]: (url, options) => {
      // jose limits refreshes after success; also bound attempts during an outage.
      if (Date.now() < nextFetchAt) {
        throw new KeyServiceUnavailableError();
      }

      nextFetchAt = Date.now() + 30_000;
      return fetch(url, options);
    },
  });

  return async (header, input) => {
    if (typeof header.kid !== 'string' || header.kid.trim() === '') {
      throw new errors.JWSInvalid('A signing key identifier is required.');
    }

    try {
      return await jwks(header, input);
    } catch (error) {
      // An unknown key is an invalid token (401), not an outage.
      if (
        error instanceof errors.JWKSNoMatchingKey ||
        error instanceof errors.JWKSMultipleMatchingKeys
      ) {
        throw error;
      }

      // Do not expose network errors, JWKS payloads, or token details.
      throw new KeyServiceUnavailableError();
    }
  };
}

/** Turn verified claims into our identity; null means the claims are unusable. */
function toIdentity(payload: JWTPayload, issuer: string) {
  if (
    typeof payload.sub !== 'string' ||
    payload.sub.trim() === '' ||
    (payload.scope !== undefined && typeof payload.scope !== 'string')
  ) {
    return null;
  }

  const identity: AuthIdentity = {
    issuer,
    subject: payload.sub,
    scopes:
      typeof payload.scope === 'string'
        ? payload.scope.split(' ').filter(Boolean)
        : [],
  };
  // A client-credentials token identifies an application, not a person.
  const machineIdentity =
    payload.gty === 'client-credentials' || payload.sub.endsWith('@clients');
  return { identity, machineIdentity };
}

function unauthorized(c: Context<AppEnv>) {
  c.header(
    'WWW-Authenticate',
    'Bearer realm="premiumpass", error="invalid_token"',
  );
  return c.json(
    { error: { code: 'unauthorized', requestId: c.get('requestId') } },
    401,
  );
}
