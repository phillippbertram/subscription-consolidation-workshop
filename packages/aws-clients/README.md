# AWS clients

Shared backend AWS SDK construction for the API, webhooks, worker, and local tools. Import from `@premiumpass/aws-clients`; commands and SDK types still come directly from the relevant `@aws-sdk/*` package.

| Factory                                         | Default attempts | Connection / request timeout              |
| ----------------------------------------------- | ---------------- | ----------------------------------------- |
| `createDynamoDbClient` / `createDocumentClient` | 3                | 1 s / 3 s                                 |
| `createSqsClient`                               | 2                | 1 s / 15 s (supports worker long polling) |
| `createSecretsManagerClient`                    | 2                | 1 s / 3 s                                 |

- DynamoDB accepts an optional validated loopback HTTP `endpoint`. Omitting it uses normal AWS endpoint, region, and credential resolution. Local initialization overrides attempts/request timeout to 1 / 1 s; local administration uses one attempt.
- SQS requires an explicit `local` flag. Local mode uses `LOCAL_SQS_ENDPOINT` (ElasticMQ on port 9324); AWS mode uses normal SDK resolution. Apple enqueueing overrides the request timeout to 3 s. Services still validate queue URLs and prohibit half-local worker configuration.
- Local endpoints always use dummy credentials and region `us-east-1`. `LOCAL_DYNAMODB_ENDPOINT` points to Compose on port 8000. Factories do not read `.env` files or choose modes implicitly.
- Secrets Manager uses AWS credential resolution; secret contents, validation, and cache lifetime belong to the calling service.

Each factory returns a new SDK client. Create it at service/runtime initialization and reuse it for requests. The caller owns shutdown via `destroy()`; destroying a DocumentClient also releases its underlying transport. No global client registry or singleton is introduced.

Table names and `LOCAL_DATABASE_CONFIG` belong to `@premiumpass/persistence`. The initialization script and subscription CLI use that fixed local configuration, regardless of ambient AWS settings. Domain, Web, Mobile, and HTTP contracts do not depend on this backend package.
