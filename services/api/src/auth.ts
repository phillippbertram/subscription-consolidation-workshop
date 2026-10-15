import type { Context } from 'hono';
import { createMiddleware } from 'hono/factory';
import { createRemoteJWKSet, customFetch, errors, jwtVerify } from 'jose';
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

export function authenticate(config: AuthConfig) {
  // One resolver per app instance: reused by local requests and warm Lambda invocations.
  let nextFetchAt = 0;
  const jwks = createRemoteJWKSet(
    new URL('.well-known/jwks.json', config.issuer),
    {
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
    },
  );

  return createMiddleware<AppEnv>(async (c, next) => {
    const authorization = c.req.header('Authorization');
    const match = authorization?.match(
      /^Bearer +([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i,
    );
    const token = match?.[1];
    if (!token || token.length > 16_384) {
      return unauthorized(c);
    }

    let identity: AuthIdentity;
    try {
      const { payload } = await jwtVerify(
        token,
        async (header, input) => {
          if (typeof header.kid !== 'string' || header.kid.trim() === '') {
            throw new errors.JWSInvalid(
              'A signing key identifier is required.',
            );
          }

          try {
            return await jwks(header, input);
          } catch (error) {
            if (
              error instanceof errors.JWKSNoMatchingKey ||
              error instanceof errors.JWKSMultipleMatchingKeys
            ) {
              throw error;
            }

            // Do not expose network errors, JWKS payloads, or token details.
            throw new KeyServiceUnavailableError();
          }
        },
        {
          algorithms: ['RS256'],
          issuer: config.issuer,
          audience: config.audience,
          requiredClaims: ['iss', 'aud', 'exp', 'sub'],
          clockTolerance: 5,
        },
      );

      if (
        typeof payload.sub !== 'string' ||
        payload.sub.trim() === '' ||
        (payload.scope !== undefined && typeof payload.scope !== 'string')
      ) {
        return unauthorized(c);
      }

      c.set(
        'machineIdentity',
        payload.gty === 'client-credentials' ||
          payload.sub.endsWith('@clients'),
      );
      identity = {
        issuer: config.issuer,
        subject: payload.sub,
        scopes:
          typeof payload.scope === 'string'
            ? payload.scope.split(' ').filter(Boolean)
            : [],
      };
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

    c.set('auth', identity);
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
