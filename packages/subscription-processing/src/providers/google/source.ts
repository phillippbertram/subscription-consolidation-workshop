import type { GoogleJob } from '@premiumpass/billing-contracts';
import {
  normalizeProviderStatus,
  subscriptionSchema,
  type Subscription,
} from '@premiumpass/domain';
import {
  readGooglePurchase,
  googleSubscriptionId,
  GooglePlayError,
  type GoogleSettings,
  type GoogleClient,
} from '@premiumpass/google-play';
import { sameDomainState } from '../../processing/subscription-state.js';

/** Google is authoritative; queue notifications contain references, never grants. */
export class GoogleSubscriptionSource {
  constructor(
    readonly settings: GoogleSettings,
    private readonly client: GoogleClient,
  ) {}

  async locate(job: GoogleJob) {
    if (job.packageName !== this.settings.packageName) {
      throw new GooglePlayError('google_package_mismatch');
    }

    const purchase = await readGooglePurchase(
      this.client,
      this.settings,
      job.purchaseToken,
    );
    const userId =
      purchase.externalAccountIdentifiers.obfuscatedExternalAccountId;
    if (job.userId && job.userId !== userId) {
      throw new GooglePlayError('google_owner_mismatch');
    }

    return { purchase, userId };
  }

  async read(
    job: GoogleJob,
    previousSubscriptions: readonly Subscription[],
    now: Date,
  ) {
    const { purchase, userId } = await this.locate(job);
    const providerSubscriptionId = googleSubscriptionId(
      this.settings,
      job.purchaseToken,
    );
    const previous = previousSubscriptions.find(
      (candidate) =>
        candidate.provider === 'google' &&
        candidate.providerSubscriptionId === providerSubscriptionId,
    );
    const subscriptionLine = purchase.lineItems[0]!;
    const subscription = subscriptionSchema.parse({
      userId,
      provider: 'google',
      providerSubscriptionId,
      productId: 'premium_monthly',
      providerStatus: purchase.subscriptionState,
      state: normalizeProviderStatus('google', purchase.subscriptionState),
      cancelAtPeriodEnd: !subscriptionLine.autoRenewingPlan.autoRenewEnabled,
      // In grace, Google's expiryTime is already the verified grace boundary.
      // Never add the demo's synthetic grace period to this provider response.
      accessUntil: subscriptionLine.expiryTime
        ? new Date(subscriptionLine.expiryTime).toISOString()
        : null,
      graceUntil: null,
      verifiedAt: now.toISOString(),
      revision: (previous?.revision ?? 0) + 1,
    });
    if (previous && sameDomainState(previous, subscription)) {
      subscription.revision = previous.revision;
    }

    // Plan replacements are outside this demo. Refuse them rather than letting
    // two tokens grant access independently or silently transferring ownership.
    if (purchase.linkedPurchaseToken) {
      throw new GooglePlayError('google_linked_purchase_unsupported');
    }

    return {
      subscription,
      needsAcknowledgement:
        purchase.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_PENDING' &&
        ['active', 'past_due'].includes(subscription.state) &&
        Boolean(
          subscription.accessUntil &&
          Date.parse(subscription.accessUntil) > now.getTime(),
        ),
    };
  }

  async acknowledge(job: GoogleJob, userId: string) {
    const current = await this.locate({ ...job, userId });
    if (
      current.purchase.acknowledgementState ===
      'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED'
    ) {
      return;
    }

    if (
      ![
        'SUBSCRIPTION_STATE_ACTIVE',
        'SUBSCRIPTION_STATE_IN_GRACE_PERIOD',
        'SUBSCRIPTION_STATE_CANCELED',
      ].includes(current.purchase.subscriptionState)
    ) {
      // A purchase that ended during a retry no longer needs acknowledgement.
      return;
    }

    try {
      await this.client.acknowledge(job.purchaseToken);
    } catch {
      // A lost response or concurrent acknowledgement is safe only if Google
      // now confirms acknowledgement of the exact same token and owner.
      const latest = await this.locate({ ...job, userId });
      if (
        latest.purchase.acknowledgementState !==
        'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED'
      ) {
        throw new GooglePlayError('google_acknowledgement_unavailable');
      }
    }
  }
}
