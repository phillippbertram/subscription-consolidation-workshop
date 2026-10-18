# Exercise 8: AWS

**Goal:** read the cloud setup as code and check that each Lambda gets only the
permissions it needs. No AWS account is needed for Part A.

## Part A: synthesize and inspect

1. Generate the CloudFormation template locally:

   ```sh
   pnpm infra:synth
   ```

   This makes no AWS calls. The result is `infra/cdk.out/PremiumPassDev.template.json`.

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

3. Answer from the output:
   - Which policies contain `dynamodb:` actions? Do any webhook roles?
   - Which role may read secrets, and which may not?
   - Which policies have a `Condition` in the template (search for `AppleConfigured`
     and `GoogleConfigured`)?

4. Read the stack the way it is assembled:
   [`infra/src/stack.ts`](../../infra/src/stack.ts) lists the building blocks in
   order; each one lives in [`infra/src/resources/`](../../infra/src/resources/storage.ts).

<details>
<summary>Answers</summary>

- Only the worker, the API, and the discovery Lambdas have DynamoDB actions. The
  webhooks can only send to the queue.
- The Stripe webhook reads the Stripe secret (for its signing secret). The
  worker reads provider keys. The Apple and Google webhooks and the API read no
  secrets.
- `AppleWorkerSecretPolicy`, `GoogleWorkerPolicy`, and `GoogleApiPolicy` exist
  only when Apple or Google is enabled at deployment time.

</details>

## Part B: deploy (optional, needs your own AWS account)

Follow the [AWS guide](../../infra/README.md#deploy) and its verification list.
Check what runs in AWS first: [what runs where](../ARCHITECTURE.md#what-runs-where).

## Think about it

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
