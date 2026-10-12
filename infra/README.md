# PremiumPass development infrastructure

P03 adds one environment-agnostic CDK stack, `PremiumPassDev`. Run commands from the repository root. Synthesis needs the pinned Node/pnpm toolchain and installed dependencies; it needs no AWS credentials, Auth0 credentials, Docker, or bootstrap resources.

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm synth
```

The assembly is written to `infra/cdk.out/`, including `PremiumPassDev.template.json` and the Lambda asset directory. These generated files are ignored by Git. The CDK app performs no account lookups. Auth0 issuer, audience, and `StripeSecretArn` are required CloudFormation parameters without defaults; their actual values are needed only for deployment.

## Resources and boundaries

| Resource | Configuration |
|---|---|
| HTTP API | `$default` to the BFF; explicit `POST /v1/webhooks/stripe` to the webhook, payload format 2.0 |
| Default stage | Automatic deployment of route changes; 10 requests/second, burst 20 |
| BFF Lambda | Node.js 24, 256 MB, 20-second timeout, reserved concurrency 2 |
| Stripe webhook | Node.js 24, 256 MB, 20-second timeout; signature verification, secret read, queue send |
| Subscription worker | Node.js 24, 256 MB, 60-second timeout, reserved concurrency 2, SQS batch size 1 |
| Work queue / DLQ | Standard, SQS-managed encryption; 360-second visibility, five receives, four-day / 14-day retention; retained |
| Lambda artifact | `index.mjs`, `index.handler`; esbuild bundles Hono, jose, and the pinned AWS SDK |
| DynamoDB | String `pk`/`sk`, on-demand billing, retained on stack deletion/replacement |
| Lambda logs | Seven-day retention; removed with the stack |
| BFF IAM role | Write to its log group; `GetItem` and `PutItem` on the stack table, restricted to `IDENTITY#*` and `USER#*` partition keys |

The `$default` route uses `AuthorizationType: NONE`; Hono defines BFF paths and methods and verifies tokens and scopes. New BFF endpoints require a backend deployment but no matching CDK route declaration. Unknown paths also invoke Lambda: the current middleware returns 401 without a valid token and 404 with one. `GET /health` remains public.

The catch-all route and the separately configured `$default` stage serve different purposes: the route selects the BFF integration, while the stage controls deployment and throttling. The explicit Stripe webhook route takes precedence over the catch-all and verifies its own signature. No API Gateway authorizer, Lambda function URL, VPC, or event bus is created. Browser CORS is currently configured only in the local BFF. [HTTP API route selection](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-develop-routes.html) · [CDK default integration](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_apigatewayv2.HttpApiProps.html).

The ESM bundle includes a `createRequire` shim for CommonJS dependencies. Importing it creates the handler without opening a server. The BFF environment contains the Auth0 parameters and table name. Webhook and worker receive the queue URL and existing secret ARN; only the worker also receives the table name. No secret values are embedded. AWS supplies the runtime region and role credentials.

Transactional puts are authorized through `dynamodb:PutItem`; there is no separate `TransactWriteItems` IAM action. The role has no scan, update, or delete permission. Partition-key restrictions do not isolate sort keys within `USER#*`: ownership and allowed record types are enforced by the repository code. P03 writes only profiles and identity mappings. Review the IAM boundary when adding domain records; the BFF must not gain domain entitlement write paths. [DynamoDB transaction IAM](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/transaction-apis-iam.html).

## Local DynamoDB and manual requests

Start Docker Desktop (or another local Docker Engine with Compose), install workspace dependencies, and run from the repository root:

```sh
pnpm local:up
```

This starts the pinned `amazon/dynamodb-local:3.3.1`, `aaronshaf/dynamodb-admin:5.3.4`, and `softwaremill/elasticmq-native:1.6.16` images through `compose.yaml`, waits for the database to respond, and creates `premiumpass-local` with string `pk`/`sk` keys and on-demand billing if it does not exist. Existing tables and records are preserved. The initializer checks the existing key schema and exits with an error if it is incompatible; it does not migrate or delete data. Startup retries are bounded, and initialization failures cause the pnpm command to fail.

The container runs in the background and binds only to `127.0.0.1:8000`. Data lives in the named Docker volume `premiumpass-local_dynamodb-data`. The initializer runs on the host with the already-installed AWS SDK, a fixed loopback endpoint, and dummy credentials. No Java installation, AWS CLI, real AWS credentials, or manual table command is needed. Starting plain `docker compose up` starts all services, including ElasticMQ, but does not initialize the table; use `pnpm local:up` for automatic table initialization.

Open **[DynamoDB Admin](http://127.0.0.1:8001)** and select `premiumpass-local`. The browser UI lists tables and lets you inspect/query items and their JSON fields. Look for `IDENTITY#…` mappings, `USER#…` profiles, and `SUB#…` subscription sort keys; see the [data model](../docs/DYNAMODB_DATA_MODEL.md). The GUI can also edit or delete records; for repeatable subscription changes, use the [scenario command](../docs/PAYMENTS.md#manual-checks).

The GUI connects to `http://dynamodb:8000` over the Compose network with dummy local credentials. Its process listens on `0.0.0.0` inside the container so Docker can forward traffic, while the host port is restricted to `127.0.0.1:8001`. It needs no separate volume or real AWS credentials. `pnpm local:down` removes all Compose containers and preserves the database volume; ElasticMQ messages are in-memory and do not survive. If the GUI port is occupied, stop the conflicting service; if the page initially shows no table, wait for `local:up` to finish and refresh. For connection errors, check both services with `docker compose ps` and inspect the GUI logs below. [DynamoDB Admin documentation](https://github.com/aaronshaf/dynamodb-admin).

In `services/bff/.env`, keep your Auth0 and `PORT` configuration and set:

```dotenv
DYNAMODB_TABLE_NAME=premiumpass-local
DYNAMODB_ENDPOINT=http://127.0.0.1:8000
```

Then start the backend:

```sh
pnpm dev:api
```

Local service commands:

| Command | Effect |
|---|---|
| `pnpm local:up` | Start/reuse the database, GUI, and ElasticMQ containers and ensure the table exists |
| `pnpm local:down` | Remove the Compose containers and network; retain the data volume |
| `pnpm local:logs dynamodb` | Show the latest 100 database log lines |
| `pnpm local:logs dynamodb-admin` | Show the latest GUI log lines |

Repeated `local:up` calls are safe. After `local:down`, the next `local:up` uses the existing data. Avoid `docker compose down --volumes` unless you deliberately want to delete all local database data. If port 8000 is already occupied, stop the earlier local database before starting Compose. If initialization fails, inspect `pnpm local:logs dynamodb` and rerun `pnpm local:up` once the cause is fixed.

The initializer deliberately uses the fixed Compose table and endpoint; BFF configuration must match them. `pnpm dev:api` also uses dummy credentials when `DYNAMODB_ENDPOINT` is set. Omitting that variable selects the AWS SDK's normal region/credential chain. Lambda rejects this local-only variable. [DynamoDB Local Docker setup](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DynamoDBLocal.DownloadingAndRunning.html) · [Local persistence options](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DynamoDBLocal.UsageNotes.html).

Use the [Auth0 setup guide](../docs/AUTH0_SETUP.md) for an actual user access token. Then perform the [README requests](../README.md#backend-authentication). Repeated requests must return the same `userId` and `createdAt`; another verified subject or issuer must get a different user. Query parameters and headers claiming another user ID must have no effect. A valid machine token returns `403 user_identity_required` and creates no profile.

Health checks do not touch DynamoDB. If the database is unavailable, profile requests fail with a generic `500 internal_error` and request ID; no in-memory profile fallback exists. Local DynamoDB checks exercise transactions, not AWS IAM enforcement.

## Development deployment scripts

The scripts use `infra/.env`, independently of `services/bff/.env`. Copy the example once, then replace its placeholders with your development AWS profile, region, expected account ID, and public Auth0 values:

```sh
cp infra/.env.example infra/.env
```

Preserve an existing file. `infra/.env` is ignored by Git. It contains configuration, not AWS access keys; AWS credentials come from the selected profile, including an active SSO session if applicable. Existing shell variables take precedence over the file. `AWS_PROFILE`, `AWS_REGION`, and the 12-digit `AWS_ACCOUNT_ID` are required. Deployment additionally requires `AUTH0_ISSUER`, `AUTH0_AUDIENCE`, and `STRIPE_SECRET_ARN` for an existing Secrets Manager JSON secret in the configured account/region.

Preview the commands without contacting AWS:

```sh
pnpm deploy:dev --dry-run
pnpm bootstrap:dev --dry-run
```

The dry run validates configuration and prints the STS/account check and CDK arguments. It performs no account lookup, synthesis, or resource changes. Use `pnpm check` and `pnpm synth` for local verification separately.

When ready to create AWS resources, run bootstrap once for the selected account/region if needed, then deploy:

```sh
pnpm bootstrap:dev
pnpm deploy:dev
```

Both commands first call `aws sts get-caller-identity` with the configured profile and region, then stop if the returned account differs from `AWS_ACCOUNT_ID`. The AWS CLI must be installed and the profile logged in. The script invokes the pinned workspace CDK CLI without a shell, passes Auth0 values and the Stripe secret ARN as CloudFormation parameters, and preserves CDK's normal approval prompts. Bootstrap is never performed implicitly by deployment.

Deployment targets `PremiumPassDev`. Successful deployment writes stack outputs to the ignored `infra/cdk.out/deploy-outputs.json`. Script failures return a nonzero exit status. Implementing or previewing these scripts does not deploy anything; actual execution against AWS remains part of the outstanding live P03 work.

Check that the account's Lambda concurrency quota permits reserving two concurrent executions. Record the actual account, region, stack, health response, and two users' profile requests in [P03](../docs/TASKS.md#p03-small-aws-stack-and-user-persistence). Synthesis does not prove deployment, IAM enforcement, or live Auth0 login.

Stack outputs are `ApiUrl`, `TableName`, and `BffLogGroupName`; none contains a secret. The retained table needs separate deliberate cleanup after any future stack deletion. Bootstrap resources also have their own lifecycle. No cleanup or deployment command runs as part of `pnpm synth`.

Implementation reference: [CDK NodejsFunction bundling](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_lambda_nodejs-readme.html).


## Local queue and Stripe processing resources

Run `pnpm local:up` to start the database/GUI plus ElasticMQ 1.6.16. Queue definitions live in [local/elasticmq.conf](local/elasticmq.conf); the API is restricted to loopback port 9324. `pnpm dev:webhook` and `pnpm dev:worker` run on the host. Follow [Stripe processing](../docs/PAYMENTS.md#processing-and-retries) for CLI forwarding, signing-secret setup, manual checks, and DLQ inspection. `pnpm local:down` stops all three services; database records persist, while queue messages are lost.

The synthesized worker uses partial batch failure responses and the queue's redrive policy. Its table permissions are `GetItem`, `Query`, `PutItem`, and `ConditionCheckItem` restricted to `USER#*`, `PROVIDER#stripe#*`, `EVENT#stripe#*`, and `OUTBOX#*`. Transaction condition checks require their own IAM action. The webhook has no table permission. Both processing functions can read the referenced secret; the webhook can send to the queue and the worker can consume it.

`StripeSecretArn` is an existing Secrets Manager secret reference, not a value or a resource that CDK creates. Its JSON contains test-mode `secretKey`, `priceId`, and the future Dashboard endpoint's `webhookSecret`. Runtime reads cache it for five minutes. The default Secrets Manager encryption key is assumed; custom KMS key grants are not configured. No secret setup, endpoint registration, or deployment is performed by synthesis.

Follow [Register the cloud webhook](../docs/PAYMENTS.md#register-the-cloud-webhook) for first-time secret creation, `STRIPE_SECRET_ARN`, the initial deployment/URL sequence, Stripe event selection, the endpoint signing secret, and delivery verification.

Outputs include `StripeWebhookUrl`, `SubscriptionQueueUrl`, and `SubscriptionDlqUrl`. The BFF's cloud checkout configuration/IAM is still outstanding, and the EventBridge publisher/reconciliation are later tasks. A successful local synthesis is not evidence of working AWS permissions, delivery, DLQ redrive, or a Stripe purchase.
