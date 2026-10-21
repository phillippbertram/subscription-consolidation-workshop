import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const infraDirectory = fileURLToPath(new URL('../', import.meta.url));

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() !== value) {
    throw new Error(
      `${name} is required without surrounding whitespace. Set it in config/.env (config/targets.mjs shows its name there) and run pnpm config:sync.`,
    );
  }

  return value;
}

function booleanSetting(name: string) {
  const value = process.env[name] ?? 'false';
  if (!['true', 'false'].includes(value)) {
    throw new Error(`${name} must be true or false.`);
  }

  return value;
}

function main() {
  const [mode, ...flags] = process.argv.slice(2);
  if (
    !['deploy', 'bootstrap'].includes(mode ?? '') ||
    flags.some((flag) => flag !== '--dry-run')
  ) {
    throw new Error('Usage: deploy.ts <deploy|bootstrap> [--dry-run]');
  }

  const profile = required('AWS_PROFILE');
  const region = required('AWS_REGION');
  const account = required('AWS_ACCOUNT_ID');
  if (!/^\d{12}$/.test(account)) {
    throw new Error('AWS_ACCOUNT_ID must contain exactly 12 digits.');
  }

  if (!/^[a-z]{2}(?:-[a-z]+)+-\d+$/.test(region)) {
    throw new Error(
      'AWS_REGION must be an AWS region name, such as eu-central-1.',
    );
  }

  const cdkArgs =
    mode === 'bootstrap'
      ? ['bootstrap', `aws://${account}/${region}`, `--profile=${profile}`]
      : ['deploy', 'PremiumPassDev', `--profile=${profile}`];
  if (mode === 'deploy') {
    const issuer = required('AUTH0_ISSUER');
    const audience = required('AUTH0_AUDIENCE');
    const stripeSecretArn = required('STRIPE_SECRET_ARN');
    if (
      !stripeSecretArn.startsWith(
        `arn:aws:secretsmanager:${region}:${account}:secret:`,
      )
    ) {
      throw new Error(
        'STRIPE_SECRET_ARN must reference a secret in the configured AWS account and region.',
      );
    }

    const appleEnabled = process.env.APPLE_ENABLED ?? 'false';
    if (!['true', 'false'].includes(appleEnabled)) {
      throw new Error('APPLE_ENABLED must be true or false.');
    }

    cdkArgs.push('--parameters', `AppleEnabled=${appleEnabled}`);
    if (appleEnabled === 'true') {
      const bundleId = required('APPLE_BUNDLE_ID');
      const productId = required('APPLE_PRODUCT_ID');
      const appleSecretArn = required('APPLE_SECRET_ARN');
      if (
        !/^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(bundleId) ||
        !/^[A-Za-z0-9._-]{1,255}$/.test(productId)
      ) {
        throw new Error('APPLE_BUNDLE_ID or APPLE_PRODUCT_ID is invalid.');
      }

      if (
        !appleSecretArn.startsWith(
          `arn:aws:secretsmanager:${region}:${account}:secret:`,
        )
      ) {
        throw new Error(
          'APPLE_SECRET_ARN must reference a secret in the configured AWS account and region.',
        );
      }

      cdkArgs.push(
        '--parameters',
        `AppleBundleId=${bundleId}`,
        '--parameters',
        `AppleProductId=${productId}`,
        '--parameters',
        `AppleSecretArn=${appleSecretArn}`,
      );
    }

    const googleEnabled = process.env.GOOGLE_PLAY_ENABLED ?? 'false';
    if (!['true', 'false'].includes(googleEnabled)) {
      throw new Error('GOOGLE_PLAY_ENABLED must be true or false.');
    }

    cdkArgs.push('--parameters', `GoogleEnabled=${googleEnabled}`);
    if (googleEnabled === 'true') {
      const packageName = required('GOOGLE_PLAY_PACKAGE_NAME');
      const productId = required('GOOGLE_PLAY_PRODUCT_ID');
      const basePlanId = required('GOOGLE_PLAY_BASE_PLAN_ID');
      const googleSecretArn = required('GOOGLE_PLAY_SECRET_ARN');
      const pushAudience = required('GOOGLE_PLAY_PUSH_AUDIENCE');
      const pushEmail = required('GOOGLE_PLAY_PUSH_SERVICE_ACCOUNT_EMAIL');
      const pushSubscription = required('GOOGLE_PLAY_PUSH_SUBSCRIPTION');
      if (
        !/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/.test(packageName) ||
        !/^[a-z0-9][a-z0-9_.]{0,39}$/.test(productId) ||
        !/^[a-z0-9][a-z0-9-]{0,62}$/.test(basePlanId)
      ) {
        throw new Error('Google package, product, or base plan is invalid.');
      }

      if (
        !googleSecretArn.startsWith(
          `arn:aws:secretsmanager:${region}:${account}:secret:`,
        )
      ) {
        throw new Error(
          'GOOGLE_PLAY_SECRET_ARN must reference a secret in the configured AWS account and region.',
        );
      }

      const audienceUrl = new URL(pushAudience);
      if (
        audienceUrl.protocol !== 'https:' ||
        audienceUrl.username ||
        audienceUrl.password ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(pushEmail) ||
        !/^projects\/[^/]+\/subscriptions\/[^/]+$/.test(pushSubscription)
      ) {
        throw new Error(
          'Google push audience, service-account email, or subscription is invalid.',
        );
      }

      cdkArgs.push(
        '--parameters',
        `GooglePackageName=${packageName}`,
        '--parameters',
        `GoogleProductId=${productId}`,
        '--parameters',
        `GoogleBasePlanId=${basePlanId}`,
        '--parameters',
        `GoogleSecretArn=${googleSecretArn}`,
        '--parameters',
        `GooglePushAudience=${pushAudience}`,
        '--parameters',
        `GooglePushServiceAccountEmail=${pushEmail}`,
        '--parameters',
        `GooglePushSubscription=${pushSubscription}`,
      );
    }

    for (const provider of ['Stripe', 'Apple', 'Google']) {
      const name = `RECONCILIATION_${provider.toUpperCase()}_ENABLED`;
      const enabled = booleanSetting(name);
      const baseEnabled =
        provider === 'Apple'
          ? appleEnabled
          : provider === 'Google'
            ? googleEnabled
            : 'true';
      if (enabled === 'true' && baseEnabled !== 'true') {
        throw new Error(
          `${name} requires ${provider === 'Apple' ? 'APPLE_ENABLED' : 'GOOGLE_PLAY_ENABLED'}=true.`,
        );
      }

      cdkArgs.push(
        '--parameters',
        `Reconciliation${provider}Enabled=${enabled}`,
      );
    }

    // Match the CloudFormation parameter constraints before invoking CDK.
    if (!/^https:\/\/[a-zA-Z0-9.-]+\/$/.test(issuer)) {
      throw new Error(
        'AUTH0_ISSUER must be an HTTPS domain with a trailing slash.',
      );
    }

    if (!/^\S+$/.test(audience)) {
      throw new Error('AUTH0_AUDIENCE must not contain whitespace.');
    }

    cdkArgs.push(
      '--parameters',
      `Auth0Issuer=${issuer}`,
      '--parameters',
      `Auth0Audience=${audience}`,
      '--parameters',
      `StripeSecretArn=${stripeSecretArn}`,
      '--outputs-file',
      'cdk.out/deploy-outputs.json',
    );
  }

  const identityArgs = [
    'sts',
    'get-caller-identity',
    `--profile=${profile}`,
    `--region=${region}`,
    '--query',
    'Account',
    '--output',
    'text',
    '--no-cli-pager',
  ];

  if (flags.includes('--dry-run')) {
    console.info(
      JSON.stringify(
        {
          mode,
          profile,
          region,
          expectedAccount: account,
          accountCheck: ['aws', ...identityArgs],
          command: ['pnpm', 'exec', 'cdk', ...cdkArgs],
        },
        null,
        2,
      ),
    );
    console.info(
      'Dry run only: no AWS requests, synthesis, bootstrap, or deployment.',
    );
    return;
  }

  const env = {
    ...process.env,
    AWS_REGION: region,
    AWS_DEFAULT_REGION: region,
    CDK_DEFAULT_ACCOUNT: account,
    CDK_DEFAULT_REGION: region,
  };
  const identity = spawnSync('aws', identityArgs, {
    env,
    encoding: 'utf8',
    stdio: ['inherit', 'pipe', 'inherit'],
  });
  if (identity.error) {
    throw identity.error;
  }

  if (identity.status !== 0) {
    throw new Error(
      'AWS account lookup failed. Check the profile and its login session.',
    );
  }

  if (identity.stdout.trim() !== account) {
    throw new Error(
      'AWS profile resolves to a different account than AWS_ACCOUNT_ID. CDK was not started.',
    );
  }

  console.info(
    `Running ${mode} for PremiumPassDev in account ${account}, region ${region}, profile ${profile}.`,
  );
  const result = spawnSync('pnpm', ['exec', 'cdk', ...cdkArgs], {
    cwd: infraDirectory,
    env,
    stdio: 'inherit',
  });
  if (result.error) {
    throw result.error;
  }

  process.exitCode = result.status ?? 1;
}

try {
  main();
} catch (error) {
  console.error(
    error instanceof Error ? error.message : 'Deployment command failed.',
  );
  process.exitCode = 1;
}
