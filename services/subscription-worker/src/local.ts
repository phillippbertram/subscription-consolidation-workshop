import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
} from '@aws-sdk/client-sqs';
import { createLogger, readLogLevel } from '@premiumpass/logging';
import { processMessage, workerRuntime } from './runtime.js';

const log = createLogger(readLogLevel(process.env), 'premiumpass-worker');
const { sqs, queueUrl, processor } = await workerRuntime(true);
let stopping = false;
const polling = new AbortController();
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    stopping = true;
    // Interrupt idle long polling, but let an in-flight job finish its transaction.
    polling.abort();
  });
}

log.info({ event: 'worker.started' });
while (!stopping) {
  try {
    const page = await sqs.send(
      new ReceiveMessageCommand({
        QueueUrl: queueUrl,
        MaxNumberOfMessages: 1,
        WaitTimeSeconds: 10,
      }),
      { abortSignal: polling.signal },
    );
    for (const message of page.Messages ?? []) {
      try {
        await processMessage(processor, message.Body ?? '', log);
        await sqs.send(
          new DeleteMessageCommand({
            QueueUrl: queueUrl,
            ReceiptHandle: message.ReceiptHandle!,
          }),
        );
      } catch {
        log.warn({ event: 'queue.retry', messageId: message.MessageId });
        // No delete and no visibility reset: the queue controls retries/DLQ.
      }
    }
  } catch {
    if (stopping) {
      break;
    }

    log.error({ event: 'queue.unavailable' });
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
}

sqs.destroy();
