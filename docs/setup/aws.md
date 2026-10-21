# AWS deployment

Deploy the supported backend components into your own development account,
verify them, and remove them again. Start with the
[local setup](README.md). The cloud diagram is in
[Architecture](../ARCHITECTURE.md#aws-deployment-topology), and
[what runs where](../ARCHITECTURE.md#what-runs-where) lists the features the stack
wires up. Resources, IAM boundaries, and the code map are in the
[infrastructure package guide](../../infra/README.md).

> [!WARNING]
> Prepared, not verified in AWS yet. Synthesis and the deploy dry runs work
> locally; a real deployment is still open in [TASKS](../TASKS.md).

## Inspect before you deploy

No AWS account is needed for this part. After installing the pinned workspace
dependencies, generate the CloudFormation template and read the permissions
each Lambda receives.

1. Generate the template locally:

   ```sh
   pnpm check
   pnpm infra:synth
   ```

   This makes no AWS calls and needs no cloud secrets or Docker. The result is
   `infra/cdk.out/PremiumPassDev.template.json`, next to the bundled Lambda
   assets.

2. List the permissions of every IAM policy:

   ```sh
   node -e '
   const t = require("./infra/cdk.out/PremiumPassDev.template.json");
   for (const [id, r] of Object.entries(t.Resources)) {
     if (r.Type !== "AWS::IAM::Policy") continue;
     const actions = r.Properties.PolicyDocument.Statement.flatMap((s) => [].concat(s.Action));
     console.log(id.padEnd(55), [...new Set(actions)].join(", "));
   }'
   ```

   **Expect:**
   - Only the worker, the API, and the discovery Lambdas have `dynamodb:`
     actions. The webhooks can only send to the queue.
   - The Stripe webhook reads the Stripe secret (for its signing secret). The
     worker reads provider keys. The Apple and Google webhooks and the API read
     no secrets.
   - `AppleWorkerSecretPolicy`, `GoogleWorkerPolicy`, and `GoogleApiPolicy`
     exist only when Apple or Google is enabled at deployment time; search the
     template for `AppleConfigured` and `GoogleConfigured` to see the conditions.

3. Read the stack the way it is assembled: [`infra/src/stack.ts`](../../infra/src/stack.ts)
   lists the building blocks in order, and the [code map](../../infra/README.md#code-map)
   names what each file creates.

A valid template does not establish deployed IAM, event delivery, or purchases.

### Why it works this way

<details>
<summary>Why is there no Auth0 authorizer on API Gateway?</summary>

The API Lambda verifies tokens itself with the same code that runs locally. One
verification path is easier to test and cannot drift between environments.

</details>

<details>
<summary>The worker's DynamoDB access is limited by key prefix. Does that isolate users?</summary>

No. `USER#*` matches every user. The prefix limit is defense in depth against
writing unrelated record types; ownership is still enforced in code.

</details>

<details>
<summary>Why are the table and queues kept when the stack is deleted?</summary>

They hold data and failed jobs. Deleting them should be a deliberate step after
inspection, not a side effect of tearing down Lambdas.

</details>

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

2. Set these in `config/.env`; `pnpm config:sync` writes them to `infra/.env`,
   which the deploy scripts read:

   | Setting                                                                                           | Source                                                                                              |
   | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
   | `AWS_PROFILE`, `AWS_REGION`, `AWS_ACCOUNT_ID`                                                     | Your profile, region, and expected 12-digit account                                                 |
   | `AUTH0_DOMAIN`, `AUTH0_AUDIENCE`                                                                  | Shared with the clients; AWS receives the issuer `https://<domain>/`                                |
   | `STRIPE_SECRET_ARN`                                                                               | Existing same-account/region secret from [Stripe cloud setup](stripe.md#register-the-cloud-webhook) |
   | Optional `CLOUD_APPLE_ENABLED`, `APPLE_BUNDLE_ID`, `APPLE_PRODUCT_ID`, `APPLE_SECRET_ARN`         | [Apple cloud configuration](apple.md#aws-notification-processing)                                   |
   | Optional `CLOUD_GOOGLE_PLAY_ENABLED`, secret ARN, `CLOUD_` push audience/subscription; shared IDs | [Google cloud configuration](google.md#aws-notification-processing)                                 |

   Stripe credentials remain required for the shared worker even when testing
   Apple or Google. Secrets use the default Secrets Manager encryption key;
   custom KMS grants are not configured. Keep AWS keys out of `.env`.

3. Preview the configuration and commands without AWS requests:

   ```sh
   pnpm infra:bootstrap:dev --dry-run
   pnpm infra:deploy:dev --dry-run
   ```

4. Bootstrap the selected account/region once if needed, then deploy:

   ```sh
   pnpm infra:bootstrap:dev
   pnpm infra:deploy:dev
   ```

   These scripts sync first, read `infra/.env`, check STS account identity against
   `AWS_ACCOUNT_ID`, and retain CDK approval prompts. Shell values override the
   file. Bootstrap is never implicit.

5. Read `infra/cdk.out/deploy-outputs.json`: `ApiUrl`, `TableName`,
   `ApiLogGroupName`, `StripeWebhookUrl`, `AppleWebhookUrl`, `GoogleWebhookUrl`, and
   work/DLQ URLs. Reconciliation adds three function names, `ReconciliationRuleName`, and
   `ReconciliationDlqUrl`. Finish provider registration in the Stripe/Apple/Google guide.

## Verify the deployed path

- Call `ApiUrl/health`: 200. Call `/v1/me` without a token: 401.
- Use two synthetic Auth0 users: repeated calls retain their own distinct IDs.
- With Google enabled, check config/sync/polling without a token (401), missing
  scopes or machine credentials (403), invalid input (400), queue failure (503),
  and accepted purchase/Restore (202). Poll until worker completion; the other
  user must still see `pending`. Follow the [Google checklist](google.md#authenticated-cloud-purchase-and-restore).
- Verify provider signature handling, queue acceptance, worker completion, and
  owned records separately. Local database mappings are not copied to AWS.
- T16/T17: force a disposable job to fail, inspect its DLQ entry, fix the cause,
  and redrive it. Preserve event identity; do not purge to hide failures.
- Record what you verified in [TASKS](../TASKS.md).

### Cloud reconciliation

After a separately authorized deployment, use the three switches in
`config/.env`: `RECONCILIATION_STRIPE_ENABLED`,
`RECONCILIATION_APPLE_ENABLED`, and `RECONCILIATION_GOOGLE_ENABLED`. Each defaults
to `false`; Apple/Google additionally require their provider opt-in (`CLOUD_APPLE_ENABLED`, `CLOUD_GOOGLE_PLAY_ENABLED`). Processing
alone no longer enables Google discovery. Both the deploy wrapper and the
CloudFormation template enforce these dependencies.

Read `StripeReconciliationFunctionName`, `AppleReconciliationFunctionName`,
`GoogleReconciliationFunctionName`, `ReconciliationRuleName`, and
`ReconciliationDlqUrl` from outputs. The former `GoogleReconciliationRuleName` /
`GoogleReconciliationDlqUrl` outputs remain aliases for the shared resources.
Each enabled target has conditional read-only discovery and queue-send rights.
Only Stripe discovery reads its test secret and lists provider subscriptions;
Apple/Google discovery has no provider key. See
[behavior and limits](../RECONCILIATION.md#cloud-reconciliation).

Preview one enabled provider using its function output and the confirmed profile
and region. Use a new synthetic UUID for each manual run; reuse it for retries:

```sh
aws lambda invoke --profile YOUR_DEVELOPMENT_PROFILE --region YOUR_REGION \
  --function-name YOUR_PROVIDER_RECONCILIATION_FUNCTION_NAME \
  --cli-binary-format raw-in-base64-out \
  --payload '{"id":"00000000-0000-4000-8000-000000000001","dryRun":true}' \
  /tmp/premiumpass-reconciliation.json
```

Inspect both CLI `FunctionError` and the response file; synchronous invocation
can return HTTP success for function failure and has no asynchronous retries.
Preview sends no jobs and performs no writes or purchase completion. Stripe
preview still lists customer subscriptions; Apple/Google preview uses stored
references only. It does not verify worker IAM or predict provider discrepancies.

After inspecting preview, a new ID with `dryRun=false` queues refreshes. Match
`runId` with worker `correlationId`; inspect durable completion and owned grants.
Repeat the same event without duplicate domain effects, then use a new ID for a
later suppressed lifecycle change. Verify provider outages and expiry while
another valid provider grant remains. Trigger an isolated provider failure and
confirm the other enabled functions still complete.

Inspect the shared discovery failure queue for target-delivery metadata or an
execution envelope identifying the failed function. Replay only that function
with the original event (`requestPayload` for execution failures), preserving
`id`. Do not redrive scheduler messages into the subscription work queue.
Repeated time-budget failures require indexed/resumable discovery.

To pause one provider, deploy its reconciliation switch as `false`; the other
targets remain active. After confirming account/region, disabling
`ReconciliationRuleName` pauses all discovery immediately. In-flight/queued work
can finish. A later deployment reapplies the configured switches. Leave provider
processing enabled while pausing only discovery.

## Cleanup

**Deleting the stack removes its API, Lambdas, roles, and log groups. Save any
needed logs first. Table and queues survive and may continue to incur charges.**
[CDK destruction](https://docs.aws.amazon.com/cdk/v2/guide/ref-cli-cmd-destroy.html)
· [CloudFormation retention](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-attribute-deletionpolicy.html).

1. End the relevant test activity and remove/disable the project's Stripe and
   Apple notification destinations and the Google Pub/Sub push subscription.
   Disable the shared reconciliation rule and let in-flight/queued work settle.
   Record table name, all work/failure queue URLs, secret
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

   | Remaining resource                                    | Deliberate cleanup                                                                                     |
   | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
   | DynamoDB table (`RETAIN`)                             | Export needed synthetic records, then delete the exact recorded table; all its records are lost        |
   | Work queue, worker DLQ, reconciliation DLQ (`RETAIN`) | Inspect needed messages, then delete the exact recorded queues; queued work is lost                    |
   | Referenced Stripe/Apple/Google secrets                | Preserve shared secrets; schedule deletion only for dedicated unused ones with a recovery window       |
   | CDK bootstrap stack/assets                            | Preserve when used by other projects; review asset bucket/repository retention before separate removal |

[Secrets Manager deletion](https://docs.aws.amazon.com/secretsmanager/latest/userguide/manage_delete-secret.html).

5. Confirm stack deletion and inspect retained resources in the selected account/
   region. Removing local `cdk.out` files does not remove any AWS resource.

Continue with [provider and local cleanup](../DEVELOPMENT.md#cleanup).
