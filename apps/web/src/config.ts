import { z } from 'zod';

export function readWebConfig() {
  const values = z
    .object({
      domain: z
        .string()
        .regex(/^[a-zA-Z0-9.-]+$/)
        .refine((v) => v !== 'your-tenant.eu.auth0.com'),
      clientId: z
        .string()
        .min(1)
        .refine((v) => v !== 'your-spa-client-id'),
      audience: z.string().min(1),
      apiUrl: z.url(),
    })
    .safeParse({
      domain: import.meta.env.VITE_AUTH0_DOMAIN as unknown,
      clientId: import.meta.env.VITE_AUTH0_CLIENT_ID as unknown,
      audience: import.meta.env.VITE_AUTH0_AUDIENCE as unknown,
      apiUrl: import.meta.env.VITE_API_URL as unknown,
    });
  if (!values.success)
    throw new Error(
      'Copy apps/web/.env.example to apps/web/.env and configure the Auth0 SPA client, audience, and API origin. Restart pnpm web:dev after editing it.',
    );
  const url = new URL(values.data.apiUrl);
  if (
    url.origin !== values.data.apiUrl ||
    (url.protocol !== 'https:' &&
      !(
        url.protocol === 'http:' &&
        ['localhost', '127.0.0.1'].includes(url.hostname)
      ))
  )
    throw new Error(
      'VITE_API_URL must be an HTTPS or loopback HTTP origin without a trailing slash.',
    );
  return values.data;
}
