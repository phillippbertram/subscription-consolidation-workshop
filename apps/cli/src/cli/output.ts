import {
  deriveEntitlements,
  type Subscription,
  type AdminGrant,
  hasAdminAccess,
} from '@premiumpass/domain';
import type { ReconciliationRow } from '@premiumpass/subscription-processing/reconciliation/stripe';

export function showSubscriptions(
  subscriptions: Subscription[],
  adminGrant: AdminGrant | null = null,
) {
  console.table(
    subscriptions.map((s) => ({
      provider: s.provider,
      subscription: s.providerSubscriptionId,
      state: s.state,
      accessUntil: s.accessUntil,
      graceUntil: s.graceUntil,
    })),
  );
  if (adminGrant) {
    console.table([
      {
        source: 'Complimentary Premium',
        state: adminGrant.state,
        currentAccess: hasAdminAccess(adminGrant, new Date()),
        expiresAt: adminGrant.expiresAt ?? 'No expiry',
        revision: adminGrant.revision,
      },
    ]);
  }

  const access = deriveEntitlements(subscriptions, new Date(), adminGrant);
  console.info(
    `Current access: ${access.tier} (${access.grants.length} valid grants).`,
  );
}

export function showReconciliation(rows: ReconciliationRow[], dryRun: boolean) {
  for (const row of rows) {
    console.info(`\n${row.subscription}: ${row.result}`);
    console.info(`  Before: ${row.before}`);
    console.info(`  After:  ${row.after}`);
  }

  console.info(
    dryRun
      ? 'Dry run: no database writes. Stripe was read only.'
      : 'Reconciliation finished. Stripe was read only. Refresh the app.',
  );
  if (!rows.length) {
    console.info('No Stripe subscriptions found. Nothing changed.');
  }
}
