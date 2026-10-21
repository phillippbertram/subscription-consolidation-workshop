export function readMobileConfig() {
  // Expo requires direct property access to inline public environment variables.
  const domain = process.env.EXPO_PUBLIC_AUTH0_DOMAIN?.trim();
  const clientId = process.env.EXPO_PUBLIC_AUTH0_CLIENT_ID?.trim();
  const audience = process.env.EXPO_PUBLIC_AUTH0_AUDIENCE?.trim();
  const apiUrl = process.env.EXPO_PUBLIC_API_URL?.trim();

  // Name each problem instead of one generic message: in a workshop the usual
  // mistake is a single setting left empty or at its example value. The names
  // are those in config/.env, which pnpm config:sync turns into the
  // EXPO_PUBLIC_* variables read above. Values never appear here.
  const problems: string[] = [];
  if (!domain) {
    problems.push('AUTH0_DOMAIN is empty');
  } else if (domain === 'your-tenant.eu.auth0.com') {
    problems.push('AUTH0_DOMAIN still has the example value');
  } else if (!/^[a-zA-Z0-9.-]+$/.test(domain)) {
    problems.push(
      'AUTH0_DOMAIN must be a bare hostname, without https:// or a path',
    );
  }

  if (!clientId) {
    problems.push('MOBILE_AUTH0_CLIENT_ID is empty');
  } else if (clientId === 'your-native-client-id') {
    problems.push('MOBILE_AUTH0_CLIENT_ID still has the example value');
  }

  if (!audience) {
    problems.push('AUTH0_AUDIENCE is empty');
  }

  if (!apiUrl) {
    problems.push('MOBILE_API_URL is empty');
  }

  // The extra checks repeat the ones above so TypeScript narrows the values.
  if (problems.length > 0 || !domain || !clientId || !audience || !apiUrl) {
    throw new Error(
      `Fix config/.env, run pnpm config:sync, then reload the app: ${problems.join('; ')}.`,
    );
  }

  let url: URL;
  try {
    url = new URL(apiUrl);
  } catch {
    throw new Error(
      'MOBILE_API_URL is not a valid URL. Use an origin such as http://192.168.1.20:3000.',
    );
  }

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
      'MOBILE_API_URL must be an HTTPS origin or a local HTTP origin (loopback, private IPv4, or .local hostname), without a path, query, or credentials.',
    );
  }

  return { domain, clientId, audience, apiUrl: url.origin };
}

export type MobileConfig = ReturnType<typeof readMobileConfig>;
