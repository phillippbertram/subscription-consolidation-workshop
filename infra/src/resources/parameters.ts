import { CfnCondition, CfnParameter, CfnRule, Fn } from 'aws-cdk-lib';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import type { Construct } from 'constructs';

export type StackParameters = ReturnType<typeof createParameters>;
export type GoogleParameters = StackParameters['google'];
export type AppleParameters = StackParameters['apple'];
export type ReconciliationParameters = StackParameters['reconciliation'];

/**
 * Deployment parameters keep synthesis independent of an AWS account and
 * avoid loading local service configuration into the cloud template.
 * Apple, Google, and each reconciliation target are opt-in switches.
 */
export function createParameters(scope: Construct) {
  const issuer = new CfnParameter(scope, 'Auth0Issuer', {
    type: 'String',
    description: 'Exact HTTPS Auth0 issuer, including its trailing slash.',
    allowedPattern: '^https://[a-zA-Z0-9.-]+/$',
  });
  const audience = new CfnParameter(scope, 'Auth0Audience', {
    type: 'String',
    description: 'Auth0 Custom API identifier, never an application client ID.',
    allowedPattern: '^\\S+$',
  });
  const secretArn = new CfnParameter(scope, 'StripeSecretArn', {
    type: 'String',
    noEcho: true,
    description:
      'Existing Secrets Manager JSON secret: secretKey (sk_test_), productId, webhookSecret. No secret value in CloudFormation.',
    allowedPattern: '^arn:[^:]+:secretsmanager:[^:]+:[0-9]{12}:secret:.+$',
  });
  // Reference an existing secret; CDK never reads or embeds its contents.
  const stripeSecret = Secret.fromSecretCompleteArn(
    scope,
    'StripeSecret',
    secretArn.valueAsString,
  );
  const apple = createAppleParameters(scope);
  const google = createGoogleParameters(scope);
  return {
    auth0: { issuer: issuer.valueAsString, audience: audience.valueAsString },
    stripeSecret,
    google,
    reconciliation: createReconciliationParameters(
      scope,
      apple.enabled,
      google.enabled,
    ),
    apple,
  };
}

function createAppleParameters(scope: Construct) {
  const enabled = new CfnParameter(scope, 'AppleEnabled', {
    type: 'String',
    default: 'false',
    allowedValues: ['true', 'false'],
    description:
      'Enable Apple Sandbox notification verification and worker processing.',
  });
  const bundleId = new CfnParameter(scope, 'AppleBundleId', {
    type: 'String',
    default: '',
    allowedPattern: '^$|^[A-Za-z0-9-]+(?:\\.[A-Za-z0-9-]+)+$',
    description: 'App Store bundle ID; required when Apple is enabled.',
  });
  const productId = new CfnParameter(scope, 'AppleProductId', {
    type: 'String',
    default: 'premiumpass.premium.monthly.v2',
    allowedPattern: '^[A-Za-z0-9._-]{1,255}$',
  });
  const secretArn = new CfnParameter(scope, 'AppleSecretArn', {
    type: 'String',
    default: '',
    noEcho: true,
    allowedPattern: '^$|^arn:[^:]+:secretsmanager:[^:]+:[0-9]{12}:secret:.+$',
    description:
      'Existing Secrets Manager JSON secret: keyId, issuerId, privateKey (P-256 PEM). Worker only.',
  });
  const condition = new CfnCondition(scope, 'AppleConfigured', {
    expression: Fn.conditionEquals(enabled.valueAsString, 'true'),
  });
  // Reject incomplete opt-in configuration even when deploying outside our CLI.
  new CfnRule(scope, 'AppleConfiguration', {
    ruleCondition: Fn.conditionEquals(enabled.valueAsString, 'true'),
    assertions: [
      {
        assert: Fn.conditionAnd(
          Fn.conditionNot(Fn.conditionEquals(bundleId.valueAsString, '')),
          Fn.conditionNot(Fn.conditionEquals(secretArn.valueAsString, '')),
        ),
        assertDescription:
          'AppleEnabled requires AppleBundleId and AppleSecretArn.',
      },
    ],
  });
  return {
    enabled: enabled.valueAsString,
    bundleId: bundleId.valueAsString,
    productId: productId.valueAsString,
    secretArn: secretArn.valueAsString,
    condition,
  };
}

function createGoogleParameters(scope: Construct) {
  const enabled = new CfnParameter(scope, 'GoogleEnabled', {
    type: 'String',
    default: 'false',
    allowedValues: ['true', 'false'],
    description:
      'Enable Google Play license-test API, notifications, and worker processing. Reconciliation has a separate opt-in.',
  });
  const packageName = new CfnParameter(scope, 'GooglePackageName', {
    type: 'String',
    default: '',
    allowedPattern: '^$|^[a-z][a-z0-9_]*(?:\\.[a-z][a-z0-9_]*)+$',
  });
  const productId = new CfnParameter(scope, 'GoogleProductId', {
    type: 'String',
    default: 'premium_monthly',
    allowedPattern: '^[a-z0-9][a-z0-9_.]{0,39}$',
  });
  const basePlanId = new CfnParameter(scope, 'GoogleBasePlanId', {
    type: 'String',
    default: 'monthly',
    allowedPattern: '^[a-z0-9][a-z0-9-]{0,62}$',
  });
  const secretArn = new CfnParameter(scope, 'GoogleSecretArn', {
    type: 'String',
    default: '',
    noEcho: true,
    allowedPattern: '^$|^arn:[^:]+:secretsmanager:[^:]+:[0-9]{12}:secret:.+$',
    description:
      'Existing Secrets Manager service-account JSON: type, client_email, private_key. Worker only.',
  });
  const pushAudience = new CfnParameter(scope, 'GooglePushAudience', {
    type: 'String',
    default: '',
    allowedPattern: '^$|^https://\\S+$',
    description:
      'Exact HTTPS audience configured on authenticated Pub/Sub push; may be a stable identifier independent of the endpoint.',
  });
  const pushEmail = new CfnParameter(scope, 'GooglePushServiceAccountEmail', {
    type: 'String',
    default: '',
    allowedPattern: '^$|^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$',
    description:
      'Expected verified email of the Pub/Sub push-auth service account.',
  });
  const pushSubscription = new CfnParameter(scope, 'GooglePushSubscription', {
    type: 'String',
    default: '',
    allowedPattern: '^$|^projects/[^/]+/subscriptions/[^/]+$',
  });
  const condition = new CfnCondition(scope, 'GoogleConfigured', {
    expression: Fn.conditionEquals(enabled.valueAsString, 'true'),
  });
  new CfnRule(scope, 'GoogleConfiguration', {
    ruleCondition: Fn.conditionEquals(enabled.valueAsString, 'true'),
    assertions: [
      {
        assert: Fn.conditionAnd(
          ...[
            packageName,
            secretArn,
            pushAudience,
            pushEmail,
            pushSubscription,
          ].map((parameter) =>
            Fn.conditionNot(Fn.conditionEquals(parameter.valueAsString, '')),
          ),
        ),
        assertDescription:
          'GoogleEnabled requires package, secret ARN, push audience, verified email, and subscription.',
      },
    ],
  });
  return {
    enabled: enabled.valueAsString,
    packageName: packageName.valueAsString,
    productId: productId.valueAsString,
    basePlanId: basePlanId.valueAsString,
    secretArn: secretArn.valueAsString,
    pushAudience: pushAudience.valueAsString,
    pushEmail: pushEmail.valueAsString,
    pushSubscription: pushSubscription.valueAsString,
    condition,
  };
}

/** One default-off switch per provider; Apple/Google also need their processing enabled. */
function createReconciliationParameters(
  scope: Construct,
  appleEnabled: string,
  googleEnabled: string,
) {
  function provider(name: string, baseEnabled?: string) {
    const enabled = new CfnParameter(scope, `Reconciliation${name}Enabled`, {
      type: 'String',
      default: 'false',
      allowedValues: ['true', 'false'],
      description: `Enable ${name} discovery on the shared five-minute reconciliation schedule.`,
    });
    const condition = new CfnCondition(scope, `${name}ReconciliationEnabled`, {
      expression: Fn.conditionEquals(enabled.valueAsString, 'true'),
    });
    if (baseEnabled) {
      new CfnRule(scope, `${name}ReconciliationConfiguration`, {
        ruleCondition: Fn.conditionEquals(enabled.valueAsString, 'true'),
        assertions: [
          {
            assert: Fn.conditionEquals(baseEnabled, 'true'),
            assertDescription: `${name} reconciliation requires ${name} processing to be enabled.`,
          },
        ],
      });
    }

    return { enabled: enabled.valueAsString, condition };
  }

  return {
    stripe: provider('Stripe'),
    apple: provider('Apple', appleEnabled),
    google: provider('Google', googleEnabled),
  };
}
