export function readWebOrigin(env: NodeJS.ProcessEnv) {
  const value = env.WEB_ORIGIN ?? 'http://localhost:5173';
  const url = new URL(value);
  if (
    url.origin !== value ||
    url.protocol !== 'http:' ||
    !['localhost', '127.0.0.1'].includes(url.hostname)
  ) {
    throw new Error(
      'WEB_ORIGIN must be a loopback HTTP origin without a trailing slash for this local checkout demo.',
    );
  }
  return value;
}

export function readStripeConfig(env: NodeJS.ProcessEnv) {
  const secretKey = env.STRIPE_SECRET_KEY;
  const priceId = env.STRIPE_PRICE_ID;
  if (!secretKey && !priceId) return null;
  if (
    !secretKey ||
    !/^sk_test_[A-Za-z0-9]+$/.test(secretKey) ||
    !priceId ||
    !/^price_[A-Za-z0-9]+$/.test(priceId)
  ) {
    throw new Error(
      'Set STRIPE_SECRET_KEY to a test secret key and STRIPE_PRICE_ID to a monthly test price, or leave both unset to disable checkout.',
    );
  }
  return { secretKey, priceId, webOrigin: readWebOrigin(env) };
}
