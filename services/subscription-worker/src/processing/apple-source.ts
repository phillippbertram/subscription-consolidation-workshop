import {
  createAppleClient,
  createAppleVerifier,
  Environment,
  Status,
  Type,
  InAppOwnershipType,
  AutoRenewStatus,
  type AppleClient,
  type AppleCredentials,
  type AppleVerifier,
  type AppleSettings,
  type JWSTransactionDecodedPayload,
} from '@premiumpass/apple-store';
import { z } from 'zod';
import {
  normalizeProviderStatus,
  subscriptionSchema,
  type Subscription,
} from '@premiumpass/domain';
import type { AppleProcessingJob } from '@premiumpass/billing-contracts';
import { ProcessingError } from './contracts.js';
import { sameDomainState } from './normalize.js';

export class AppleSubscriptionSource {
  constructor(
    private readonly settings: AppleSettings,
    private readonly client: AppleClient,
    private readonly verifier: AppleVerifier,
  ) {}

  private validate(transaction: JWSTransactionDecodedPayload, userId: string) {
    if (
      transaction.environment !== Environment.SANDBOX ||
      transaction.bundleId !== this.settings.bundleId ||
      transaction.productId !== this.settings.productId ||
      transaction.type !== Type.AUTO_RENEWABLE_SUBSCRIPTION ||
      transaction.inAppOwnershipType !== InAppOwnershipType.PURCHASED ||
      transaction.appAccountToken?.toLowerCase() !== userId ||
      !z
        .string()
        .regex(/^[0-9]{1,64}$/)
        .safeParse(transaction.originalTransactionId).success ||
      !z
        .string()
        .regex(/^[0-9]{1,64}$/)
        .safeParse(transaction.transactionId).success ||
      !z.number().int().positive().safeParse(transaction.expiresDate).success
    ) {
      throw new ProcessingError('apple_purchase_not_owned_or_supported');
    }
  }

  async read(
    job: AppleProcessingJob,
    previousSubscriptions: Subscription[],
    now: Date,
  ): Promise<{ subscription: Subscription; finishTransactionId: string }> {
    let originalId: string;
    let submittedTransactionId: string | undefined;
    if (job.eventType === 'reconciliation') {
      // Reconciliation only revisits known lineages. It cannot discover or assign
      // an unknown purchase; client sync/restore or a signed notification must do that.
      originalId = job.transactionId;
      if (
        !previousSubscriptions.some(
          (subscription) =>
            subscription.userId === job.userId &&
            subscription.provider === 'apple' &&
            subscription.providerSubscriptionId === `Sandbox:${originalId}`,
        )
      ) {
        throw new ProcessingError('apple_subscription_not_known');
      }
    } else {
      const info = await this.client.getTransactionInfo(job.transactionId);
      if (!info.signedTransactionInfo) {
        throw new ProcessingError('apple_transaction_missing');
      }

      const submitted = await this.verifier.verifyAndDecodeTransaction(
        info.signedTransactionInfo,
      );
      this.validate(submitted, job.userId);
      if (
        submitted.transactionId !== job.transactionId &&
        submitted.originalTransactionId !== job.transactionId
      ) {
        throw new ProcessingError('apple_transaction_mismatch');
      }

      originalId = submitted.originalTransactionId!;
      submittedTransactionId = submitted.transactionId!;
    }

    // Resolve current state even when the submitted transaction/notification is old.
    const response = await this.client.getAllSubscriptionStatuses(originalId);
    if (
      response.environment !== Environment.SANDBOX ||
      response.bundleId !== this.settings.bundleId
    ) {
      throw new ProcessingError('apple_environment_mismatch');
    }

    const matches =
      response.data
        ?.flatMap((group) => group.lastTransactions ?? [])
        .filter((item) => item.originalTransactionId === originalId) ?? [];
    if (
      matches.length !== 1 ||
      !matches[0]?.signedTransactionInfo ||
      !matches[0].signedRenewalInfo
    ) {
      throw new ProcessingError('apple_subscription_missing');
    }

    const item = matches[0];
    const transaction = await this.verifier.verifyAndDecodeTransaction(
      item.signedTransactionInfo!,
    );
    const renewal = await this.verifier.verifyAndDecodeRenewalInfo(
      item.signedRenewalInfo!,
    );
    this.validate(transaction, job.userId);
    if (
      transaction.originalTransactionId !== originalId ||
      renewal.originalTransactionId !== originalId ||
      renewal.productId !== this.settings.productId ||
      renewal.environment !== Environment.SANDBOX ||
      (renewal.appAccountToken &&
        renewal.appAccountToken.toLowerCase() !== job.userId)
    ) {
      throw new ProcessingError('apple_renewal_mismatch');
    }

    if (transaction.isUpgraded) {
      throw new ProcessingError('apple_upgrade_unsupported');
    }

    const status = transaction.revocationDate ? Status.REVOKED : item.status;
    const state = normalizeProviderStatus('apple', String(status));
    if (!state) {
      throw new ProcessingError('apple_status_unsupported');
    }

    const providerSubscriptionId = `Sandbox:${originalId}`;
    const previous = previousSubscriptions.find(
      (s) =>
        s.provider === 'apple' &&
        s.providerSubscriptionId === providerSubscriptionId,
    );
    const grace =
      status === Status.BILLING_GRACE_PERIOD
        ? renewal.gracePeriodExpiresDate
        : undefined;
    if (
      status === Status.BILLING_GRACE_PERIOD &&
      !z.number().int().positive().safeParse(grace).success
    ) {
      throw new ProcessingError('apple_grace_missing');
    }

    const next = subscriptionSchema.parse({
      userId: job.userId,
      provider: 'apple',
      providerSubscriptionId,
      productId: 'premium_monthly',
      providerStatus: String(status),
      state,
      cancelAtPeriodEnd: renewal.autoRenewStatus === AutoRenewStatus.OFF,
      accessUntil: new Date(transaction.expiresDate!).toISOString(),
      graceUntil: grace ? new Date(grace).toISOString() : null,
      verifiedAt: now.toISOString(),
      revision: (previous?.revision ?? 0) + 1,
    });
    if (previous && sameDomainState(previous, next)) {
      next.revision = previous.revision;
    }

    return {
      subscription: next,
      // A missed renewal has no submitted transaction. Finish the current signed
      // transaction after commit; retries retain that exact target in the marker.
      finishTransactionId: submittedTransactionId ?? transaction.transactionId!,
    };
  }

  async finish(transactionId: string) {
    try {
      await this.client.finishTransaction(transactionId);
    } catch {
      // Keep the committed marker and let the queue retry without logging SDK data.
      throw new ProcessingError('apple_finish_unavailable');
    }
  }
}

export function createAppleSource(
  settings: AppleSettings,
  credentials: AppleCredentials,
) {
  return new AppleSubscriptionSource(
    settings,
    createAppleClient(settings, credentials),
    createAppleVerifier(settings),
  );
}
