import { setTimeout } from 'node:timers/promises';
import { Command } from 'commander';
import {
  createDocumentClient,
  createSqsClient,
} from '@premiumpass/aws-clients';
import { createLogger, readLogLevel } from '@premiumpass/logging';
import { LOCAL_DATABASE_CONFIG } from '@premiumpass/persistence';
import { DynamoDbOutboxStore } from './store.js';
import { LocalQueueSink } from './local-queue.js';
import { publishOutbox } from './publisher.js';

const command = new Command()
  .name('outbox:publish')
  .description('Publish pending events from DynamoDB Local to ElasticMQ only.')
  .option('--dry-run', 'Preview pending IDs without queue or database writes')
  .option('--watch', 'Repeat a full scan every five seconds')
  .parse();
const options = command.opts<{ dryRun?: boolean; watch?: boolean }>();
const log = createLogger(readLogLevel(process.env), 'premiumpass-outbox');
const database = createDocumentClient(LOCAL_DATABASE_CONFIG);
const sqs = createSqsClient({ local: true });
const store = new DynamoDbOutboxStore(
  database,
  LOCAL_DATABASE_CONFIG.tableName,
);
const sink = new LocalQueueSink(sqs);
const stopping = new AbortController();
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => stopping.abort());
}

try {
  do {
    try {
      const summary = await publishOutbox(store, sink, log, {
        ...options,
        signal: stopping.signal,
      });
      log.info({
        event: 'outbox.completed',
        dryRun: Boolean(options.dryRun),
        ...summary,
      });
      if (!options.watch && (summary.failed || summary.invalid)) {
        process.exitCode = 1;
      }
    } catch {
      log.error({ event: 'outbox.scan_failed' });
      if (!options.watch) {
        process.exitCode = 1;
      }
    }

    if (!options.watch || stopping.signal.aborted) {
      break;
    }

    await setTimeout(5_000, undefined, { signal: stopping.signal }).catch(
      () => {},
    );
  } while (!stopping.signal.aborted);
} finally {
  database.destroy();
  sqs.destroy();
}
