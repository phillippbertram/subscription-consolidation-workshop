import { deriveEntitlements, type Subscription } from '@premiumpass/domain';
import type { ReconciliationRow } from '../reconciliation/stripe.js';

export function showSubscriptions(subscriptions: Subscription[]) {
  console.table(
    subscriptions.map((s) => ({
      provider: s.provider,
      subscription: s.providerSubscriptionId,
      state: s.state,
      accessUntil: s.accessUntil,
      graceUntil: s.graceUntil,
    })),
  );
  const access = deriveEntitlements(subscriptions, new Date());
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
