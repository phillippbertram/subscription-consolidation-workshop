export function readMobileConfig() {
  // Expo requires direct property access to inline public environment variables.
  const domain = process.env.EXPO_PUBLIC_AUTH0_DOMAIN?.trim();
  const clientId = process.env.EXPO_PUBLIC_AUTH0_CLIENT_ID?.trim();
  const audience = process.env.EXPO_PUBLIC_AUTH0_AUDIENCE?.trim();
  const apiUrl = process.env.EXPO_PUBLIC_API_URL?.trim();

  if (
    !domain ||
    !/^[a-zA-Z0-9.-]+$/.test(domain) ||
    domain === 'your-tenant.eu.auth0.com' ||
    !clientId ||
    clientId === 'your-native-client-id' ||
    !audience ||
    !apiUrl
  ) {
    throw new Error(
      'Set the public Auth0 domain, Native Client ID, API audience, and API URL in apps/mobile/.env, then reload the app.',
    );
  }

  const url = new URL(apiUrl);
  const localHttp =
    url.protocol === 'http:' &&
    ['127.0.0.1', 'localhost', '10.0.2.2'].includes(url.hostname);
  if (
    (!localHttp && url.protocol !== 'https:') ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  ) {
    throw new Error(
      'API URL must be an HTTPS origin or a local simulator HTTP origin.',
    );
  }

  return { domain, clientId, audience, apiUrl: url.origin };
}

export type MobileConfig = ReturnType<typeof readMobileConfig>;
