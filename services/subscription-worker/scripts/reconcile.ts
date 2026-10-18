import { setTimeout } from 'node:timers/promises';
import { Command, Option, InvalidArgumentError } from 'commander';
import { z } from 'zod';
import { createLogger, readLogLevel } from '@premiumpass/logging';
import { createLocalSubscriptionStore } from '../src/local-admin/store.js';
import {
  runLocalReconciliation,
  type LocalReconciliationOptions,
} from '../src/reconciliation/local-run.js';
import {
  localReconciliationQueue,
  localStripeReader,
  localAppleReader,
} from '../src/reconciliation/local-runtime.js';

const program = new Command()
  .description(
    'Reconcile DynamoDB Local through ElasticMQ using Stripe test / Apple Sandbox; no AWS access.',
  )
  .option('--user <uuid>', 'Only reconcile this internal user', (value) => {
    if (!z.uuid().safeParse(value).success) {
      throw new InvalidArgumentError('Use an internal user UUID.');
    }

    return value;
  })
  .addOption(
    new Option(
      '--provider <provider>',
      'Provider to refresh; expiry always runs',
    )
      .choices(['all', 'stripe', 'apple', 'google_mock', 'none'])
      .default('all'),
  )
  .option('--dry-run', 'Read and preview without database or queue writes')
  .option(
    '--watch',
    'Start now, then repeat every five minutes without overlapping runs',
  )
  .parse();
const options = program.opts<{
  user?: string;
  provider: LocalReconciliationOptions['provider'];
  dryRun?: boolean;
  watch?: boolean;
}>();
const log = createLogger(
  readLogLevel(process.env),
  'premiumpass-reconciliation',
);
const local = createLocalSubscriptionStore();
const queue = localReconciliationQueue();
const stopping = new AbortController();
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => stopping.abort());
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
  local.close();
  queue.close();
}
