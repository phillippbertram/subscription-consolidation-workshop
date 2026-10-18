import type { SQSEvent, SQSBatchResponse } from 'aws-lambda';
import { createLogger, readLogLevel } from '@premiumpass/logging';
import { processMessage, workerRuntime } from './runtime.js';

const log = createLogger(readLogLevel(process.env), 'premiumpass-worker');
export async function handler(event: SQSEvent): Promise<SQSBatchResponse> {
  // CDK enables ReportBatchItemFailures: Lambda removes successful records and
  // retries only these SQS IDs after visibility expires. They are transport IDs,
  // distinct from the Stripe event IDs used to deduplicate domain processing.
  const batchItemFailures: SQSBatchResponse['batchItemFailures'] = [];
  try {
    const { processor } = workerRuntime(false);
    for (const record of event.Records) {
      try {
        await processMessage(processor, record.body, log);
      } catch {
        log.warn({ event: 'queue.retry', messageId: record.messageId });
        batchItemFailures.push({ itemIdentifier: record.messageId });
      }
    }
  } catch {
    // Initialization failed before processing. An empty failure list here would
    // incorrectly acknowledge and discard every message in the batch.
    log.error({ event: 'worker.unavailable' });
    return {
      batchItemFailures: event.Records.map((record) => ({
        itemIdentifier: record.messageId,
      })),
    };
  }

  return { batchItemFailures };
}
