import { setTimeout } from 'node:timers/promises';
import { createLogger, readLogLevel } from '@premiumpass/logging';
import type { LocalSubscriptionStore } from '../local-admin/store.js';
import {
  runLocalReconciliation,
  type LocalReconciliationOptions,
} from './local-run.js';
import {
  localReconciliationQueue,
  localStripeReader,
  localAppleReader,
  localGoogleReader,
} from './local-runtime.js';

export interface ReconciliationOptions {
  user?: string;
  provider: LocalReconciliationOptions['provider'];
  dryRun?: boolean;
  watch?: boolean;
}

/** Own the watch lifecycle; the CLI entry owns the shared local database client. */
export async function reconcile(
  local: LocalSubscriptionStore,
  options: ReconciliationOptions,
) {
  const log = createLogger(
    readLogLevel(process.env),
    'premiumpass-reconciliation',
  );
  const queue = localReconciliationQueue();
  const stopping = new AbortController();
  const stop = () => stopping.abort();
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, stop);
  }

  try {
    do {
      const started = Date.now();
      try {
        const summary = await runLocalReconciliation({
          local,
          log,
          enqueue: (job) => queue.enqueue(job),
          stripe: localStripeReader,
          apple: localAppleReader,
          google: localGoogleReader,
          provider: options.provider,
          dryRun: Boolean(options.dryRun),
          signal: stopping.signal,
          ...(options.user ? { userId: options.user } : {}),
        });
        if (summary.failed && !options.watch) {
          process.exitCode = 1;
        }
      } catch {
        log.error({ event: 'reconciliation.run_failed' });
        if (!options.watch) {
          process.exitCode = 1;
        }
      }

      if (!options.watch || stopping.signal.aborted) {
        break;
      }

      await setTimeout(
        Math.max(1_000, 300_000 - (Date.now() - started)),
        undefined,
        { signal: stopping.signal },
      ).catch(() => {});
    } while (!stopping.signal.aborted);
  } finally {
    queue.close();
    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
      process.removeListener(signal, stop);
    }
  }
}
