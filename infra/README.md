# AWS development infrastructure

Deploy the supported backend components into your own development account.
Start locally with [Getting started](../docs/GETTING_STARTED.md); see
[architecture](../docs/ARCHITECTURE.md#aws-deployment-topology) for the cloud diagram.

## Resources and boundaries

| Resource                | Configuration                                                                             |
| ----------------------- | ----------------------------------------------------------------------------------------- |
| HTTP API                | Default API integration; explicit Stripe/Apple POST webhook routes; no Gateway authorizer |
| API and webhook Lambdas | Node 24; 20 s timeout; API verifies Auth0, webhooks verify provider signatures            |
| Subscription worker     | 60 s timeout, concurrency 2, batch size 1, partial failure reporting                      |
| Work queue / DLQ        | Standard SQS; visibility 360 s; five receives; retention 4 / 14 days                      |
| DynamoDB                | One on-demand table, `pk`/`sk`, no secondary index or TTL                                 |
| Logs                    | CloudWatch, seven-day retention                                                           |
| Secrets                 | Existing Secrets Manager references; no values embedded in CDK                            |

API IAM permits identity/profile access and user-partition subscription reads.
Worker IAM covers user, provider-owner, completion, and outbox records. Webhooks
cannot access DynamoDB; Apple ingress cannot read private keys. These policies
limit key families, while code still enforces individual ownership.

The stack supports profile/access reads and provider notification processing.
Cloud checkout/cancellation, browser CORS, and authenticated Apple config/sync/
completion wiring remain incomplete. It creates no VPC, EventBridge publisher,
or reconciliation schedule. See [TASKS](../docs/TASKS.md) for verification status.

## Synthesize locally

After installing the pinned workspace dependencies:

```sh
pnpm check
pnpm synth
```

Inspect `infra/cdk.out/PremiumPassDev.template.json` and bundled Lambda assets.
Synthesis performs no AWS lookups and needs no cloud secrets or Docker. A valid
template does not establish deployed IAM, event delivery, or purchases.

## Deploy

1. Install the [AWS CLI v2](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html).
   Prepare a development account, region, and profile with deployment/secret
   permissions. For an account with IAM Identity Center, follow
   [SSO setup](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-sso.html):

   ```sh
   aws configure sso --profile premiumpass-dev
   aws sso login --profile premiumpass-dev
   aws sts get-caller-identity --profile premiumpass-dev
   ```

   Use the returned account ID below; obtain the SSO start URL and account role
   from your AWS administrator. If your account uses another credential method,
   configure its named profile instead. Check budget and service quotas, including
   capacity for the configured Lambda concurrency reservations.

2. Copy `infra/.env.example` to `infra/.env` only if absent. Set:

   | Setting                                                                             | Source                                                                                                        |
   | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
   | `AWS_PROFILE`, `AWS_REGION`, `AWS_ACCOUNT_ID`                                       | Your profile, region, and expected 12-digit account                                                           |
   | `AUTH0_ISSUER`, `AUTH0_AUDIENCE`                                                    | Same Custom API/issuer as the clients                                                                         |
   | `STRIPE_SECRET_ARN`                                                                 | Existing same-account/region secret from [Stripe cloud setup](../docs/PAYMENTS.md#register-the-cloud-webhook) |
   | Optional `APPLE_ENABLED`, `APPLE_BUNDLE_ID`, `APPLE_PRODUCT_ID`, `APPLE_SECRET_ARN` | [Apple cloud configuration](../docs/APPLE_PURCHASES.md#aws-notification-processing)                           |

   Stripe credentials remain required for the shared worker even when testing
   Apple. Secrets use the default Secrets Manager encryption key; custom KMS
   grants are not configured. Keep AWS keys out of `.env`.

3. Preview the configuration and commands without AWS requests:

   ```sh
   pnpm bootstrap:dev --dry-run
   pnpm deploy:dev --dry-run
   ```

4. Bootstrap the selected account/region once if needed, then deploy:

   ```sh
   pnpm bootstrap:dev
   pnpm deploy:dev
   ```

   These scripts read `infra/.env`, check STS account identity against
   `AWS_ACCOUNT_ID`, and retain CDK approval prompts. Shell values override the
   file. Bootstrap is never implicit.

5. Read `infra/cdk.out/deploy-outputs.json`: `ApiUrl`, `TableName`,
   `ApiLogGroupName`, both webhook URLs, and work/DLQ URLs. Finish the provider
   endpoint registration in the Stripe/Apple guide.

## Verify the deployed path

- Call `ApiUrl/health`: 200. Call `/v1/me` without a token: 401.
- Use two synthetic Auth0 users: repeated calls retain their own distinct IDs.
- Verify provider signature handling, queue acceptance, worker completion, and
  owned records separately. Local database mappings are not copied to AWS.
- T16/T17: force a disposable job to fail, inspect its DLQ entry, fix the cause,
  and redrive it. Preserve event identity; do not purge to hide failures.
- Record actual AWS evidence under P03/P06/P07 in [TASKS](../docs/TASKS.md).

## Cleanup

**Deleting the stack removes its API, Lambdas, roles, and log groups. Save any
needed logs first. Table and queues survive and may continue to incur charges.**
[CDK destruction](https://docs.aws.amazon.com/cdk/v2/guide/ref-cli-cmd-destroy.html)
· [CloudFormation retention](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-attribute-deletionpolicy.html).

1. End the relevant test activity and remove/disable the project's Stripe and
   Apple notification destinations. Record table name, both queue URLs, secret
   ARNs, and any needed evidence before removing the stack.
2. Explicitly select the intended profile and region in your terminal. The raw
   CDK command below does **not** load `infra/.env` or run the deploy wrapper's
   account guard:

   ```sh
   export AWS_PROFILE=YOUR_DEVELOPMENT_PROFILE
   export AWS_REGION=YOUR_REGION
   aws sts get-caller-identity
   aws cloudformation describe-stacks --stack-name PremiumPassDev
   aws cloudformation list-stack-resources --stack-name PremiumPassDev
   ```

   Compare the returned account/region and physical resources with the intended
   deployment. Stop if they differ.

3. Only for that confirmed deployment, remove the stack with its normal prompt:

   ```sh
   pnpm --filter @premiumpass/infra exec cdk destroy PremiumPassDev --exclusively
   ```

4. Inspect and handle the remaining resources individually:

   | Remaining resource              | Deliberate cleanup                                                                                     |
   | ------------------------------- | ------------------------------------------------------------------------------------------------------ |
   | DynamoDB table (`RETAIN`)       | Export needed synthetic records, then delete the exact recorded table; all its records are lost        |
   | Work queue and DLQ (`RETAIN`)   | Inspect needed messages, then delete the exact recorded queues; queued work is lost                    |
   | Referenced Stripe/Apple secrets | Preserve shared secrets; schedule deletion only for dedicated unused ones with a recovery window       |
   | CDK bootstrap stack/assets      | Preserve when used by other projects; review asset bucket/repository retention before separate removal |

   [Secrets Manager deletion](https://docs.aws.amazon.com/secretsmanager/latest/userguide/manage_delete-secret.html).

5. Confirm stack deletion and inspect retained resources in the selected account/
   region. Removing local `cdk.out` files does not remove any AWS resource.

Continue with [provider and local cleanup](../docs/DEVELOPMENT.md#cleanup).
