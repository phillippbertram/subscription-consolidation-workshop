# Stripe, checkout, and subscription flow

This walkthrough connects the checkout code, DynamoDB records, and entitlement rules. The diagrams describe the local implementation and the planned asynchronous processing separately. Implementation status and verification evidence remain in [P06](TASKS.md#p06-stripe-purchase-and-reliable-processing).

For credentials and startup, use [Stripe setup](STRIPE_SETUP.md). For exact stored fields, use the [DynamoDB data model](DYNAMODB_DATA_MODEL.md).

## 1. Different objects, different responsibilities

| Object                  | Meaning                                                                            | Where it lives                                                      |
| ----------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Auth0 identity          | The validated issuer and subject identify the signed-in person                     | Auth0; mapped in DynamoDB                                           |
| Internal user           | Stable PremiumPass UUID used for ownership                                         | DynamoDB `PROFILE` and identity mapping                             |
| Stripe customer         | Billing contact linked to one internal user; includes the verified email           | Stripe `cus_...`; ownership references in DynamoDB                  |
| Checkout attempt        | One application request, retained across retries                                   | DynamoDB `REQUEST`; UUID in browser session storage                 |
| Checkout Session        | Hosted purchase page with an open, complete, or expired state                      | Stripe `cs_test_...`; its ID is saved on the attempt                |
| Stripe subscription     | Recurring billing contract and provider lifecycle                                  | Stripe `sub_...`                                                    |
| Normalized subscription | PremiumPass representation of a provider's subscription and verified access period | DynamoDB `SUB#...`                                                  |
| Entitlement             | A feature granted by any currently valid subscription                              | Currently calculated on API reads; a persisted aggregate is planned |

A complete Checkout Session does not itself establish Premium access. Payment/subscription verification and a write to the application's subscription model must connect those two parts.

## 2. Checkout sequence — implemented locally

This is the successful first-purchase path. The BFF receives only `planId` and an idempotency key from the browser. It derives identity, email, customer, price, and return URLs on the server.

```mermaid
sequenceDiagram
    autonumber
    actor User as Demo user
    participant Web as React website
    participant Auth as Auth0
    participant BFF as Hono BFF
    participant DB as DynamoDB Local
    participant Stripe as Stripe test API
    participant Hosted as Hosted Checkout

    User->>Web: Sign in
    Web->>Auth: Universal Login with PKCE
    Auth-->>Web: SDK session and access token
    User->>Web: Continue to test checkout
    Web->>BFF: POST checkout-session, Bearer token, planId, attempt UUID
    BFF->>BFF: Verify JWT, user identity, scopes, origin, and input
    BFF->>Auth: GET /userinfo with the same access token
    Auth-->>BFF: Subject, email, email_verified
    BFF->>BFF: Require matching subject and verified email
    BFF->>DB: Resolve validated issuer and subject to internal userId
    BFF->>DB: Read checkout attempt and reserve customer intent
    alt No stored customer ID
        BFF->>Stripe: Create customer using stable creation idempotency key
        Stripe-->>BFF: Customer ID
        BFF->>DB: Transaction: forward customer mapping and reverse owner
    end
    BFF->>DB: Check reverse customer ownership
    BFF->>Stripe: Retrieve customer and check owner metadata and test mode
    opt Verified email differs
        BFF->>Stripe: Update email on the same customer
    end
    BFF->>Stripe: Validate configured monthly price
    BFF->>DB: Check active checkout pointer
    BFF->>Stripe: Check for an existing blocking subscription
    BFF->>DB: Transaction: reserve REQUEST and CHECKOUT#ACTIVE
    BFF->>Stripe: Create subscription Checkout Session with stable attempt key
    Stripe-->>BFF: Session ID, hosted URL, expiry
    BFF->>DB: Conditionally save session ID on REQUEST
    BFF-->>Web: Session ID, hosted URL, expiry
    Web->>Hosted: Open returned URL
    User->>Hosted: Submit synthetic payment details
    Hosted-->>Web: Return to success or cancel URL
    Note over Web,DB: Returning to the website never writes a subscription or grants Premium
```

The email is retrieved through the fixed configured Auth0 issuer, not from browser form data or an unverified token decode. Missing verification stops checkout before Stripe is called. It is sent to the owned Stripe customer but is not stored in DynamoDB. Customer creation and the email update are separate so an older creation request can still be retried with identical parameters.

For an existing attempt, the service reuses its persisted parameters and retrieves or recovers its session. It does not repeat the new-attempt reservation shown above. See [retry rules](#4-retries-and-concurrent-purchases).

## 3. DynamoDB relationships — implemented records

DynamoDB has no foreign-key joins here. The arrows describe references checked by application code. `U` means the internal user UUID, `C` the Stripe customer ID, and `R` the browser's checkout-attempt UUID. The customer-creation request has its own separate UUID.

```mermaid
flowchart TD
    Identity["IDENTITY#hash / MAP<br/>validated issuer + subject → userId"]
    subgraph UserPartition["Partition: USER#U"]
        Profile["PROFILE<br/>userId, identityHash, createdAt"]
        Customer["CUSTOMER#stripe<br/>creation requestId, createdAt, customerId C"]
        Active["CHECKOUT#ACTIVE<br/>requestId R"]
        Sub["SUB#provider#subscriptionId<br/>state, accessUntil, graceUntil, revision"]
    end
    Owner["PROVIDER#stripe#CUSTOMER#C / OWNER<br/>customerId C → userId U"]
    Request["CHECKOUT#U#R / REQUEST<br/>fingerprint, customerId, priceId,<br/>return URLs, timestamps, optional sessionId"]
    RemoteCustomer["Stripe customer C<br/>email and owner metadata"]
    RemoteSession["Stripe Checkout Session<br/>customer C, mode subscription"]

    Identity --> Profile
    Customer -->|customerId| Owner
    Owner -->|userId| Profile
    Customer -->|customerId| RemoteCustomer
    Active -->|requestId| Request
    Request -->|customerId| RemoteCustomer
    Request -->|sessionId when saved| RemoteSession
    Sub -->|read by| Policy["deriveEntitlements with current time"]
```

The `SUB#...` shape and read path already exist. The P05 local scenario command writes only its reserved Apple/Google demo records; checkout does not yet write a Stripe `SUB#stripe#sub_...` item.

| Operation                 | Atomic boundary                             | Why it matters                                                 |
| ------------------------- | ------------------------------------------- | -------------------------------------------------------------- |
| Resolve a new user        | Identity mapping + profile transaction      | Concurrent first requests converge on one internal user        |
| Reserve customer creation | Conditional customer-intent put             | Retries share one creation request UUID                        |
| Save the Stripe customer  | Forward mapping + reverse owner transaction | A customer cannot silently move to another user                |
| Reserve checkout          | Request item + active pointer transaction   | Two different attempts cannot both become the current purchase |
| Save session ID           | Conditional request update                  | The fingerprint and any existing session reference must agree  |

These transactions cover DynamoDB only. Stripe creation happens outside them. Persisting the intent before the provider call and reusing Stripe idempotency keys closes the common retry window without pretending there is a transaction spanning both services.

Neither Stripe's hosted URL nor email is stored on the request. The BFF retrieves the URL from Stripe when needed. The customer mapping contains no payment state; the active pointer is a purchase lock, not an entitlement.

## 4. Retries and concurrent purchases

The following decision diagram describes purchase attempts after authentication, verified-email lookup, and customer ownership checks. An Auth0 or Stripe outage stops progress; it does not bypass the checks.

```mermaid
flowchart TD
    Request["Checkout request with attempt UUID"] --> Known{"Attempt already stored?"}
    Known -->|Yes| Fingerprint{"Same plan, price, and return URLs?"}
    Fingerprint -->|No| Conflict["409 idempotency_conflict"]
    Fingerprint -->|Yes| Recover["Retrieve saved session or recover with the same Stripe key"]
    Known -->|No| Prior{"Previous active attempt?"}
    Prior -->|Yes| Inspect["Retrieve or recover previous session"]
    Inspect --> State{"Stripe session status?"}
    State -->|Open| Busy["409 checkout_in_progress"]
    State -->|Complete| Complete["409 checkout_already_completed"]
    State -->|Expired| Subscription
    Prior -->|No| Subscription{"Blocking Stripe subscription?"}
    Subscription -->|Yes| Existing["409 subscription_already_exists"]
    Subscription -->|No| Reserve["Conditionally reserve request and active pointer"]
    Reserve -->|Won reservation| Recover
    Reserve -->|Lost to same UUID| Recover
    Reserve -->|Lost to different UUID| Busy
    Recover --> Result{"Session result?"}
    Result -->|Open and unexpired| URL["Return the same hosted session"]
    Result -->|Expired| Expired["409 checkout_expired; new UUID may be used"]
    Result -->|Complete| Complete
    Recover -->|Outcome unresolved beyond retry window| Manual["409 recovery_required; inspect original operation"]
    Inspect -->|Outcome unresolved beyond retry window| Manual
```

The code also validates the configured price before reserving a new attempt. If another call reserves the same UUID between reads, it reloads that attempt. DynamoDB transient failures can return 500; retry with the same UUID.

- **Cancel is not expiration.** Returning via Cancel leaves the session open. The same attempt can resume it; a different attempt remains blocked.
- **Sessions expire after one hour.** A replacement requires Stripe to report the previous session as expired, not just the local clock to pass its timestamp.
- **Unknown outcomes are conservative.** Customer creation without a saved ID stops automatic recovery after 23 hours. Checkout creation without a saved session ID stops after 20 minutes to preserve the fixed expiry's validity. A known session ID can still be retrieved afterward.
- **Completion retains the lock in this slice.** There is no lifecycle-driven unlock or repair command yet, even if the subscription is later canceled. Do not delete mapping/lock records to bypass this behavior.
- **Existing subscriptions block another purchase.** Only `canceled` and `incomplete_expired` are excluded from this check.

Full errors and recovery guidance are in [Stripe setup](STRIPE_SETUP.md#retries-and-recovery).

## 5. From Stripe subscription to local access — planned processing

The following diagram is the target from the [project plan](../PROJECT_PLAN.md#11-events-and-reliable-processing). The webhook, queue, processor transaction, outbox publisher, and reconciliation path are not part of the current checkout implementation. Their task boundaries are shown explicitly.

```mermaid
flowchart TD
    Stripe["Stripe test subscription and invoice lifecycle"]
    subgraph Step2["P06 step 2: reliable processing"]
        Hook["Webhook: verify signature against unchanged bytes"]
        Queue["SQS work queue"]
        Worker["Processor: deduplicate, resolve owner,<br/>read local revision and current provider state"]
        Normalize["Validate subscription and relevant paid invoice;<br/>derive verified access period and all user grants"]
        Tx["One conditional DynamoDB transaction:<br/>SUB + ENTITLEMENTS + PROCESSED<br/>+ pending OUTBOX if domain state changed"]
        DLQ["DLQ after repeated failures"]
    end
    subgraph Publish["P08: event publication"]
        Publisher["Read pending outbox entries"]
        Bus["EventBridge"]
        Consumer["Observable event consumer"]
    end
    Reconcile["P09: reconcile known customers and subscriptions"]

    Stripe -->|Signed event| Hook
    Hook -->|Enqueue before returning success| Queue
    Queue --> Worker
    Worker -->|Fetch provider state| Stripe
    Worker --> Normalize
    Normalize --> Tx
    Tx -->|Revision conflict: reread and recompute| Worker
    Worker -->|Failure: retry via queue| Queue
    Queue -->|Receive limit reached| DLQ
    Tx -->|Outbox persisted| Publisher
    Publisher -->|Publish, then mark accepted entries sent| Bus
    Bus --> Consumer
    Reconcile -->|Submit synchronization work| Queue
```

The planned worker resolves the stored customer owner and validates the provider references before writing access. A webhook is a trigger to fetch current provider state, not a command to blindly apply an old payload. Neither a success redirect nor `checkout.session.completed` alone is enough to grant Premium.

The completion marker is committed with the resulting state. A failure before commit leaves work retryable; duplicate completed events can be recognized. A condition on the previous user aggregate revision prevents one provider's update from overwriting another provider's grant. Conflicts require rereading both provider state and local data before recomputing.

The outbox prevents the crash window between saving access and publishing its change. Publication is separate from access: a delayed EventBridge consumer must not block Premium reads. A crash after publication may publish twice, so the event keeps a stable domain event ID. Reconciliation submits work through the same processing path to repair missed notifications; it does not implement a second entitlement policy.

## 6. How the API decides Premium access — implemented read path

The current API derives entitlements directly from stored `SUB#...` records. It does not read a materialized `ENTITLEMENTS` item, call Stripe on every request, or use checkout status. The future transaction above must preserve these time and multi-provider rules.

```mermaid
flowchart TD
    Request["GET premium score history"] --> Auth["Verify user JWT and read:premium scope"]
    Auth --> User["Resolve internal user from validated issuer and subject"]
    User --> Read["Query that user's SUB records;<br/>consistent, paginated, schema and ownership checked"]
    Read --> Evaluate["deriveEntitlements with current time"]
    Evaluate --> Grants{"Any valid score_history grant?"}
    Grants -->|Yes| Allow["200: synthetic history"]
    Grants -->|No| Deny["403: premium_required"]
    Clock["Exclusive expiry: now must be before validUntil"] --> Evaluate
    Union["Combine all providers; one ended grant cannot remove another"] --> Evaluate
```

For the entitlement endpoint, the same calculation returns a Free/Premium tier and grants using `read:me`. A malformed database record fails closed with 500. The status-to-access policy is described fully in [Subscriptions](SUBSCRIPTIONS.md#access-policy).

A synthetic lifecycle example shows the separation:

| Event or condition                                                  | Stripe/provider state                  | Application access rule                                                                                        |
| ------------------------------------------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Checkout opened or payment incomplete                               | Pending purchase                       | No grant from checkout                                                                                         |
| Matching subscription and paid period verified by the future worker | Active with verified `accessUntil`     | Premium while `now < accessUntil`                                                                              |
| Cancellation scheduled for period end                               | Still active, `cancelAtPeriodEnd=true` | Keep access to the same verified boundary                                                                      |
| Renewal payment fails                                               | Past due                               | Prior access plus a fixed stored grace, capped at 24 hours after prior access; no grace for an initial failure |
| Boundary passes with no new event                                   | Row can remain in DynamoDB             | Next API evaluation removes that expired grant                                                                 |
| One provider is revoked while another is valid                      | Multiple subscriptions                 | Preserve the other provider's grant                                                                            |

`effectiveUntil` is the earliest boundary at which the current response needs reevaluation. It is not necessarily the time all Premium access ends. DynamoDB TTL is not an access-control clock.

## 7. Follow the code

| Concern                                          | Source                                                                     |
| ------------------------------------------------ | -------------------------------------------------------------------------- |
| Protected checkout route and input validation    | [app.ts](../services/bff/src/app.ts)                                       |
| Verified email and UserInfo subject check        | [auth0-email.ts](../services/bff/src/billing/auth0-email.ts)               |
| Customer, attempt, and retry orchestration       | [checkout-service.ts](../services/bff/src/billing/checkout-service.ts)     |
| Stripe customer/email/session calls              | [stripe-provider.ts](../services/bff/src/billing/stripe-provider.ts)       |
| Conditional records and transactions             | [dynamodb-billing.ts](../services/bff/src/billing/dynamodb-billing.ts)     |
| Persisted field schemas and provider/store ports | [contracts.ts](../services/bff/src/billing/contracts.ts)                   |
| Subscription reads                               | [dynamodb-subscriptions.ts](../services/bff/src/dynamodb-subscriptions.ts) |
| Pure entitlement calculation                     | [domain/subscriptions.ts](../services/bff/src/domain/subscriptions.ts)     |
| Browser attempt UUID and redirects               | [use-checkout.ts](../apps/web/src/hooks/use-checkout.ts)                   |

For the first hands-on pass, follow sections 2 and 3 while inspecting only your synthetic user's rows in DynamoDB Admin. Then run the [P05 subscription scenarios](SUBSCRIPTIONS.md#local-manual-walkthrough) to observe section 6. Connecting an actual Stripe purchase to those rows is the processing work in section 5.
