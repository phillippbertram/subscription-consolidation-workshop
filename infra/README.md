# AWS development infrastructure

The CDK workspace that defines the optional cloud deployment. To synthesize,
inspect, deploy, verify, and remove it, follow
[AWS deployment](../docs/setup/aws.md). See
[architecture](../docs/ARCHITECTURE.md#aws-deployment-topology) for the cloud
diagram. This guide describes the resources, their boundaries, and the code.

## Resources and boundaries

| Resource                | Configuration                                                                                                                     |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| HTTP API                | Default API integration; explicit Stripe/Apple/Google POST webhook routes; no Gateway authorizer                                  |
| API and webhook Lambdas | Node 24; 20 s timeout; API verifies Auth0, webhooks verify provider signatures or Pub/Sub JWT identity                            |
| Subscription worker     | 60 s timeout, concurrency 2, batch size 1, partial failure reporting                                                              |
| Work queue / DLQ        | Standard SQS; visibility 360 s; five receives; retention 4 / 14 days                                                              |
| Reconciliation          | One five-minute rule; three separately enabled discovery Lambdas (60 s, concurrency 1 each); shared retained 14-day failure queue |
| DynamoDB                | One on-demand table, `pk`/`sk`, no secondary index or TTL                                                                         |
| Logs                    | CloudWatch, seven-day retention                                                                                                   |
| Secrets                 | Existing Secrets Manager references; no values embedded in CDK                                                                    |

| Role     | May                                                                    | May not                                |
| -------- | ---------------------------------------------------------------------- | -------------------------------------- |
| API      | Read/write identity and profile records; query a user's subscriptions  | Read provider keys                     |
| Webhooks | Send to the queue (Stripe also reads its signing secret)               | Touch DynamoDB; read Apple/Google keys |
| Worker   | Read provider keys; write user, provider-owner, marker, outbox records | Write identity mappings                |
| Google   | Extra API/worker rights only with `GoogleEnabled=true`                 | Anything while Google is disabled      |

Key-prefix conditions limit record families, not individual users: `USER#*`
also covers profiles and subscriptions, so the code still enforces ownership
and keeps the API from writing entitlement records.

Which features the stack wires up is listed in
[what runs where](../docs/ARCHITECTURE.md#what-runs-where). The stack creates
no VPC and no EventBridge outbox publisher.

## Code map

[`src/stack.ts`](src/stack.ts) assembles the stack from small building blocks in
[`src/resources/`](src/resources/storage.ts):

| File                | Creates                                                            |
| ------------------- | ------------------------------------------------------------------ |
| `parameters.ts`     | Deployment parameters, opt-in switches, and their validation rules |
| `storage.ts`        | DynamoDB table, work queue, and worker DLQ (all retained)          |
| `lambda.ts`         | Shared Lambda bundling defaults and log groups                     |
| `webhooks.ts`       | Stripe, Apple, and Google webhook Lambdas with queue-send rights   |
| `worker.ts`         | Subscription worker, its SQS trigger, and key-prefix-limited IAM   |
| `api.ts`            | API Lambda and role, plus the HTTP API with webhook routes         |
| `reconciliation.ts` | Five-minute rule, one discovery Lambda per provider, failure queue |
| `outputs.ts`        | URLs and names printed after deployment                            |

Resources are created directly in the stack, so splitting the code does not
change any CloudFormation logical ID.
