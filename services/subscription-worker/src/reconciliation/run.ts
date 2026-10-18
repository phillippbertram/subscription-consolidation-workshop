import type { SubscriptionJob } from '@premiumpass/billing-contracts';
import type { Logger } from '@premiumpass/logging';
import { ProcessingError } from '@premiumpass/subscription-processing/contracts';

export interface ReconciliationRun {
  runId: string;
  receivedAt: string;
  dryRun: boolean;
  enqueue: (job: SubscriptionJob) => Promise<void>;
  log: Logger;
  checkTime: () => void;
  pageSize?: number;
}

/** Discovery never commits state: accepted references still need fresh worker verification. */
export async function runReconciliation<Reference>(
  options: ReconciliationRun & {
    provider: 'stripe' | 'apple' | 'google';
    references: AsyncIterable<Reference | undefined>;
    describe: (reference: Reference) => { userId: string; referenceId: string };
    jobs: (
      reference: Reference,
    ) => Promise<SubscriptionJob[]> | SubscriptionJob[];
  },
) {
  const { provider, log, runId, dryRun, checkTime } = options;
  const summary = {
    provider,
    runId,
    dryRun,
    discovered: 0,
    queued: 0,
    failed: 0,
  };
  for await (const reference of options.references) {
    checkTime();
    if (!reference) {
      summary.failed++;
      log.error({ event: 'reconciliation.invalid_reference', provider, runId });
      continue;
    }

    const fields = { provider, runId, ...options.describe(reference) };
    let jobs: SubscriptionJob[];
    try {
      jobs = await options.jobs(reference);
    } catch {
      summary.failed++;
      log.error({ event: 'reconciliation.discovery_failed', ...fields });
      continue;
    }

    for (const job of jobs) {
      checkTime();
      summary.discovered++;
      try {
        if (!dryRun) {
          await options.enqueue(job);
          summary.queued++;
        }

        log.info({
          event: 'reconciliation.reference',
          ...fields,
          providerEventId: job.eventId,
          result: dryRun ? 'would queue' : 'queued',
        });
      } catch {
        summary.failed++;
        log.error({
          event: 'reconciliation.enqueue_failed',
          ...fields,
          providerEventId: job.eventId,
        });
      }
    }
  }

  log.info({ event: 'reconciliation.completed', ...summary });
  if (summary.failed > 0) {
    // Retry the whole provider run. Stable job IDs make already accepted jobs safe.
    throw new ProcessingError('reconciliation_incomplete');
  }

  return summary;
}
