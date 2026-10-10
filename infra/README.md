# PremiumPass development infrastructure

P03 adds one environment-agnostic CDK stack, `PremiumPassDev`. Run commands from the repository root. Synthesis needs the pinned Node/pnpm toolchain and installed dependencies; it needs no AWS credentials, Auth0 credentials, Docker, or bootstrap resources.

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm synth
```

The assembly is written to `infra/cdk.out/`, including `PremiumPassDev.template.json` and the Lambda asset directory. These generated files are ignored by Git. The CDK app performs no account lookups. Auth0 issuer and audience are required CloudFormation parameters without defaults; their actual values are needed only for deployment.

## Resources and boundaries

| Resource | Configuration |
|---|---|
| HTTP API | `$default` catch-all route to the BFF, Lambda proxy integration with payload format 2.0 |
| Default stage | Automatic deployment of route changes; 10 requests/second, burst 20 |
| BFF Lambda | Node.js 24, 256 MB, 20-second timeout, reserved concurrency 2 |
| Lambda artifact | `index.mjs`, `index.handler`; esbuild bundles Hono, jose, and the pinned AWS SDK |
| DynamoDB | String `pk`/`sk`, on-demand billing, retained on stack deletion/replacement |
| Lambda logs | Seven-day retention; removed with the stack |
| Lambda IAM role | Write to its log group; `GetItem` and `PutItem` on the stack table, restricted to `IDENTITY#*` and `USER#*` partition keys |

The `$default` route uses `AuthorizationType: NONE`; Hono defines BFF paths and methods and verifies tokens and scopes. New BFF endpoints require a backend deployment but no matching CDK route declaration. Unknown paths also invoke Lambda: the current middleware returns 401 without a valid token and 404 with one. `GET /health` remains public.

The catch-all route and the separately configured `$default` stage serve different purposes: the route selects the BFF integration, while the stage controls deployment and throttling. Future explicit routes, such as the separate Stripe webhook Lambda, take precedence over the catch-all. No API Gateway authorizer, Lambda function URL, VPC, queue, or event bus is created. CORS follows with the browser client in P06. [HTTP API route selection](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-develop-routes.html) · [CDK default integration](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_apigatewayv2.HttpApiProps.html).

The ESM bundle includes a `createRequire` shim for CommonJS dependencies. Importing it creates the handler without opening a server. The Lambda environment contains only the Auth0 parameters and the generated table name. AWS supplies the runtime region and role credentials.

Transactional puts are authorized through `dynamodb:PutItem`; there is no separate `TransactWriteItems` IAM action. The role has no scan, update, or delete permission. Partition-key restrictions do not isolate sort keys within `USER#*`: ownership and allowed record types are enforced by the repository code. P03 writes only profiles and identity mappings. Review the IAM boundary when adding domain records; the BFF must not gain domain entitlement write paths. [DynamoDB transaction IAM](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/transaction-apis-iam.html).

## Local DynamoDB and manual requests

Start Docker Desktop (or another local Docker Engine with Compose), install workspace dependencies, and run from the repository root:

```sh
pnpm db:up
```

This starts the pinned `amazon/dynamodb-local:3.3.1` image through `compose.yaml`, waits for the database to respond, and creates `premiumpass-local` with string `pk`/`sk` keys and on-demand billing if it does not exist. Existing tables and records are preserved. The initializer checks the existing key schema and exits with an error if it is incompatible; it does not migrate or delete data. Startup retries are bounded, and initialization failures cause the pnpm command to fail.

The container runs in the background and binds only to `127.0.0.1:8000`. Data lives in the named Docker volume `premiumpass-local_dynamodb-data`. The initializer runs on the host with the already-installed AWS SDK, a fixed loopback endpoint, and dummy credentials. No Java installation, AWS CLI, real AWS credentials, or manual table command is needed. Starting plain `docker compose up` starts only the database; use `pnpm db:up` for automatic table initialization.

In `services/bff/.env`, keep your Auth0 and `PORT` configuration and set:

```dotenv
DYNAMODB_TABLE_NAME=premiumpass-local
DYNAMODB_ENDPOINT=http://127.0.0.1:8000
```

Then start the backend:

```sh
pnpm dev
```

Database commands:

| Command | Effect |
|---|---|
| `pnpm db:up` | Start/reuse the database container and ensure its table exists |
| `pnpm db:down` | Remove the Compose containers and network; retain the data volume |
| `pnpm db:logs` | Show the latest 100 database log lines |

Repeated `db:up` calls are safe. After `db:down`, the next `db:up` uses the existing data. Avoid `docker compose down --volumes` unless you deliberately want to delete all local database data. If port 8000 is already occupied, stop the earlier local database before starting Compose. If initialization fails, inspect `pnpm db:logs` and rerun `pnpm db:up` once the cause is fixed.

The initializer deliberately uses the fixed Compose table and endpoint; BFF configuration must match them. `pnpm dev` also uses dummy credentials when `DYNAMODB_ENDPOINT` is set. Omitting that variable selects the AWS SDK's normal region/credential chain. Lambda rejects this local-only variable. [DynamoDB Local Docker setup](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DynamoDBLocal.DownloadingAndRunning.html) · [Local persistence options](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DynamoDBLocal.UsageNotes.html).

Use the [Auth0 setup guide](../docs/AUTH0_SETUP.md) for an actual user access token. Then perform the [README requests](../README.md#backend-authentication). Repeated requests must return the same `userId` and `createdAt`; another verified subject or issuer must get a different user. Query parameters and headers claiming another user ID must have no effect. A valid machine token returns `403 user_identity_required` and creates no profile.

Health checks do not touch DynamoDB. If the database is unavailable, profile requests fail with a generic `500 internal_error` and request ID; no in-memory profile fallback exists. Local DynamoDB checks exercise transactions, not AWS IAM enforcement.

## Development deployment scripts

The scripts use `infra/.env`, independently of `services/bff/.env`. Copy the example once, then replace its placeholders with your development AWS profile, region, expected account ID, and public Auth0 values:

```sh
cp infra/.env.example infra/.env
```

Preserve an existing file. `infra/.env` is ignored by Git. It contains configuration, not AWS access keys; AWS credentials come from the selected profile, including an active SSO session if applicable. Existing shell variables take precedence over the file. `AWS_PROFILE`, `AWS_REGION`, and the 12-digit `AWS_ACCOUNT_ID` are required. Deployment additionally requires `AUTH0_ISSUER` and `AUTH0_AUDIENCE`.

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

Both commands first call `aws sts get-caller-identity` with the configured profile and region, then stop if the returned account differs from `AWS_ACCOUNT_ID`. The AWS CLI must be installed and the profile logged in. The script invokes the pinned workspace CDK CLI without a shell, passes Auth0 values as CloudFormation parameters, and preserves CDK's normal approval prompts. Bootstrap is never performed implicitly by deployment.

Deployment targets `PremiumPassDev`. Successful deployment writes stack outputs to the ignored `infra/cdk.out/deploy-outputs.json`. Script failures return a nonzero exit status. Implementing or previewing these scripts does not deploy anything; actual execution against AWS remains part of the outstanding live P03 work.

Check that the account's Lambda concurrency quota permits reserving two concurrent executions. Record the actual account, region, stack, health response, and two users' profile requests in [P03](../docs/TASKS.md#p03-small-aws-stack-and-user-persistence). Synthesis does not prove deployment, IAM enforcement, or live Auth0 login.

Stack outputs are `ApiUrl`, `TableName`, and `BffLogGroupName`; none contains a secret. The retained table needs separate deliberate cleanup after any future stack deletion. Bootstrap resources also have their own lifecycle. No cleanup or deployment command runs as part of `pnpm synth`.

Implementation reference: [CDK NodejsFunction bundling](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_lambda_nodejs-readme.html).
