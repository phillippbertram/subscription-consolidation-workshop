import { z } from 'zod';
import type { AuthIdentity } from '../auth.js';
import type { AuthConfig } from '../config.js';
import { CheckoutError } from './contracts.js';

// Call only after the API has verified the token and checkout scopes.
export async function getVerifiedCheckoutEmail(
  config: AuthConfig,
  identity: AuthIdentity,
  authorization: string,
): Promise<string> {
  let body: unknown;
  try {
    const response = await fetch(new URL('userinfo', config.issuer), {
      headers: { Authorization: authorization, Accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(5_000),
    });
    if (response.status === 401) {
      throw new CheckoutError('unauthorized', 401);
    }

    if (!response.ok) {
      throw new CheckoutError('auth0_profile_unavailable', 503);
    }

    body = await response.json();
  } catch (error) {
    if (error instanceof CheckoutError) {
      throw error;
    }

    // Never expose SDK/network errors, token headers, or profile payloads.
    throw new CheckoutError('auth0_profile_unavailable', 503);
  }

  const profile = z.object({ sub: z.string().min(1) }).safeParse(body);
  if (!profile.success) {
    throw new CheckoutError('auth0_profile_unavailable', 503);
  }

  if (
    profile.data.sub !== identity.subject ||
    identity.issuer !== config.issuer
  ) {
    throw new CheckoutError('auth0_profile_identity_mismatch', 403);
  }

  const verified = z
    .object({
      email: z.email().max(254),
      email_verified: z.literal(true),
    })
    .safeParse(body);
  if (!verified.success) {
    throw new CheckoutError('verified_email_required', 403);
  }

  return verified.data.email;
}
