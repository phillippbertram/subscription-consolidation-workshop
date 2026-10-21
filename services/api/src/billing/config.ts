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
  const productId = env.STRIPE_PRODUCT_ID;
  const monthlyLookupKey = env.STRIPE_MONTHLY_PRICE_LOOKUP_KEY;
  const dailyLookupKey = env.STRIPE_DAILY_PRICE_LOOKUP_KEY;
  if (
    !secretKey &&
    !productId &&
    !monthlyLookupKey &&
    !dailyLookupKey &&
    !env.STRIPE_PRICE_ID &&
    !env.STRIPE_PRICE_LOOKUP_KEY
  ) {
    return null;
  }

  if (
    !secretKey ||
    !/^sk_test_[A-Za-z0-9]+$/.test(secretKey) ||
    !productId ||
    !/^prod_[A-Za-z0-9]+$/.test(productId) ||
    !monthlyLookupKey ||
    monthlyLookupKey.trim() !== monthlyLookupKey ||
    !dailyLookupKey ||
    dailyLookupKey.trim() !== dailyLookupKey ||
    monthlyLookupKey === dailyLookupKey
  ) {
    throw new Error(
      'Set STRIPE_SECRET_KEY (test mode), STRIPE_PRODUCT_ID, STRIPE_MONTHLY_PRICE_LOOKUP_KEY, and STRIPE_DAILY_PRICE_LOOKUP_KEY with distinct lookup keys, or leave all unset to disable checkout. STRIPE_PRICE_ID and STRIPE_PRICE_LOOKUP_KEY are no longer used.',
    );
  }

  return {
    secretKey,
    productId,
    priceLookupKeys: {
      premium_monthly: monthlyLookupKey,
      premium_daily: dailyLookupKey,
    },
    webOrigin: readWebOrigin(env),
  };
}
