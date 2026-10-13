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
  const [first, second] = url.hostname.split('.').map(Number);
  const privateIpv4 =
    /^\d+\.\d+\.\d+\.\d+$/.test(url.hostname) &&
    (first === 10 ||
      (first === 172 && second !== undefined && second >= 16 && second <= 31) ||
      (first === 192 && second === 168));
  const localHttp =
    url.protocol === 'http:' &&
    (['127.0.0.1', 'localhost', '10.0.2.2'].includes(url.hostname) ||
      privateIpv4 ||
      url.hostname.endsWith('.local'));
  if (
    (!localHttp && url.protocol !== 'https:') ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  ) {
    throw new Error(
      'API URL must be an HTTPS origin or a local HTTP origin (loopback, private IPv4, or .local hostname).',
    );
  }

  return { domain, clientId, audience, apiUrl: url.origin };
}

export type MobileConfig = ReturnType<typeof readMobileConfig>;
