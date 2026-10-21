import { userInfo } from 'node:os';
import type { SQSClient } from '@aws-sdk/client-sqs';
import {
  appleReconciliationJobSchema,
  expirationJobSchema,
  googleJobSchema,
  stripeReconciliationJobSchema,
  type SubscriptionJob,
} from '@premiumpass/billing-contracts';
import {
  googleSubscriptionId,
  purchaseTokenSchema,
} from '@premiumpass/google-play/contracts';
import {
  DynamoDbProcessingStore,
  expirationDue,
} from '@premiumpass/subscription-processing';
import {
  changeAdminGrant,
  DynamoDbAdminGrantStore,
} from '@premiumpass/subscription-processing/admin-grants';
import type { AdminGrant } from '@premiumpass/domain';
import type {
  AdminGrantView,
  AdminJobPlan,
  AdminPremiumRequest,
  AdminPremiumResult,
  AdminRunRequest,
  AdminRunResult,
  AdminState,
} from '@premiumpass/api-contracts/admin';
import { enqueueJob } from './queues.js';

export interface ActionDependencies {
  store: DynamoDbProcessingStore;
  sqs: SQSClient;
  providers: AdminState['providers'];
  now: () => Date;
}

/**
 * The server sets the audit actor; a form can never choose it. The shared
 * secret names no person, so the OS user of the local API process stands in,
 * the same trust boundary as `pnpm cli premium`.
 */
export const consoleActor = `admin-console:${userInfo().username}`;

/** Grant or revoke through the shared admin-grant transaction, preview first. */
export async function changePremium(
  dependencies: ActionDependencies,
  userId: string,
  request: AdminPremiumRequest,
): Promise<AdminPremiumResult> {
  const result = await changeAdminGrant(
    new DynamoDbAdminGrantStore(dependencies.store),
    {
      requestId: request.requestId,
      userId,
      action: request.action,
      actor: consoleActor,
      reason: request.reason,
      expiresAt: request.action === 'grant' ? request.expiresAt : null,
    },
    { dryRun: request.dryRun },
    dependencies.now,
  );
  return {
    outcome: result.outcome,
    aggregateRevision: result.aggregateRevision,
    actor: result.actor,
    before: grantView(result.before),
    after: grantView(result.after),
  };
}

function grantView(grant: AdminGrant | null): AdminGrantView | null {
  if (!grant) {
    return null;
  }

  const { state, expiresAt, revision, createdAt, updatedAt } = grant;
  return { state, expiresAt, revision, createdAt, updatedAt };
}

/**
 * Queue one reconciliation job per stored subscription. The console holds no
 * provider keys and decides nothing about provider state: the worker reads
 * the current state and commits through the same path as a notification.
 *
 * This refreshes known subscriptions only. Finding a subscription that was
 * never stored (a missed first webhook) stays with `pnpm cli reconcile`.
 */
export async function refreshUser(
  dependencies: ActionDependencies,
  userId: string,
  request: AdminRunRequest,
): Promise<AdminRunResult> {
  const aggregate = await dependencies.store.load(userId);
  const receivedAt = dependencies.now().toISOString();
  const jobs: AdminJobPlan[] = [];
  for (const subscription of aggregate.subscriptions) {
    const reference = subscription.providerSubscriptionId;
    const planned = await planRefresh(
      dependencies,
      userId,
      subscription.provider,
      reference,
      request.runId,
      receivedAt,
    );
    jobs.push(await submit(dependencies, planned, request.dryRun));
  }

  return { runId: request.runId, dryRun: request.dryRun, jobs };
}

/**
 * Queue an expiration job only when a stored boundary has passed. The API
 * already enforces expiry; the job refreshes the snapshot and announces it.
 */
export async function expireUser(
  dependencies: ActionDependencies,
  userId: string,
  request: AdminRunRequest,
): Promise<AdminRunResult> {
  const aggregate = await dependencies.store.load(userId);
  const now = dependencies.now();
  const eventId = `expire_${request.runId}_${userId}`;
  const planned: Planned = expirationDue(aggregate, now)
    ? {
        kind: 'expiration',
        reference: userId,
        job: expirationJobSchema.parse({
          provider: 'local_expiration',
          eventType: 'expiration',
          eventId,
          userId,
          correlationId: request.runId,
          receivedAt: now.toISOString(),
        }),
      }
    : {
        kind: 'expiration',
        reference: userId,
        skip: 'No stored access boundary has passed.',
      };
  return {
    runId: request.runId,
    dryRun: request.dryRun,
    jobs: [await submit(dependencies, planned, request.dryRun)],
  };
}

type Planned =
  | { kind: AdminJobPlan['kind']; reference: string; job: SubscriptionJob }
  | { kind: AdminJobPlan['kind']; reference: string; skip: string };

/** Same event-ID rules as the local reconciliation run, so markers line up. */
async function planRefresh(
  dependencies: ActionDependencies,
  userId: string,
  provider: string,
  reference: string,
  runId: string,
  receivedAt: string,
): Promise<Planned> {
  const { providers } = dependencies;
  if (provider === 'stripe') {
    if (!providers.stripe || !/^sub_[A-Za-z0-9]+$/.test(reference)) {
      return {
        kind: 'stripe',
        reference,
        skip: providers.stripe
          ? 'Not a Stripe subscription ID.'
          : 'Stripe is not configured for the local backend.',
      };
    }

    return {
      kind: 'stripe',
      reference,
      job: stripeReconciliationJobSchema.parse({
        provider: 'stripe',
        eventType: 'reconciliation',
        eventId: `reconcile_${runId}_${reference}`,
        expectedUserId: userId,
        objectId: reference,
        correlationId: runId,
        receivedAt,
      }),
    };
  }

  if (provider === 'apple') {
    const originalId = /^Sandbox:([0-9]{1,64})$/.exec(reference)?.[1];
    if (!providers.apple || !originalId) {
      return {
        kind: 'apple',
        reference,
        skip: providers.apple
          ? 'Not an Apple Sandbox reference.'
          : 'Apple is not enabled for the local backend.',
      };
    }

    return {
      kind: 'apple',
      reference,
      job: appleReconciliationJobSchema.parse({
        provider: 'apple',
        environment: 'Sandbox',
        eventType: 'reconciliation',
        eventId: `reconcile_${runId}_${originalId}`,
        transactionId: originalId,
        userId,
        correlationId: runId,
        receivedAt,
      }),
    };
  }

  if (provider === 'google') {
    return planGoogleRefresh(
      dependencies,
      userId,
      reference,
      runId,
      receivedAt,
    );
  }

  return {
    kind: 'demo',
    reference,
    skip: 'Local demo record; there is no provider to ask.',
  };
}

/**
 * Google needs the private purchase token from the owner record. It goes into
 * the job on the server and never into a response or a log line.
 */
async function planGoogleRefresh(
  dependencies: ActionDependencies,
  userId: string,
  reference: string,
  runId: string,
  receivedAt: string,
): Promise<Planned> {
  if (!dependencies.providers.google) {
    return {
      kind: 'google',
      reference,
      skip: 'Google Play is not enabled for the local backend.',
    };
  }

  const owner = await dependencies.store.get(
    `PROVIDER#google#SUB#${reference}`,
    'OWNER',
  );
  const token = purchaseTokenSchema.safeParse(owner?.purchaseToken);
  const packageName =
    typeof owner?.packageName === 'string' ? owner.packageName : '';
  if (
    !token.success ||
    owner?.userId !== userId ||
    googleSubscriptionId({ packageName }, token.data) !== reference
  ) {
    return {
      kind: 'google',
      reference,
      skip: 'The owner record does not match this subscription.',
    };
  }

  return {
    kind: 'google',
    reference,
    job: googleJobSchema.parse({
      provider: 'google',
      environment: 'test',
      eventType: 'reconciliation',
      packageName,
      purchaseToken: token.data,
      eventId: `reconcile_${runId}_${reference.split(':')[1]}`,
      userId,
      correlationId: runId,
      receivedAt,
    }),
  };
}

async function submit(
  dependencies: ActionDependencies,
  planned: Planned,
  dryRun: boolean,
): Promise<AdminJobPlan> {
  if ('skip' in planned) {
    return {
      kind: planned.kind,
      reference: planned.reference,
      eventId: null,
      status: 'skipped',
      reason: planned.skip,
    };
  }

  if (!dryRun) {
    await enqueueJob(dependencies.sqs, planned.job);
  }

  return {
    kind: planned.kind,
    reference: planned.reference,
    eventId: planned.job.eventId,
    status: dryRun ? 'would_queue' : 'queued',
    reason: null,
  };
}
