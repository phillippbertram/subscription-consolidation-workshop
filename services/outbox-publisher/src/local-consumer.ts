import { setTimeout } from 'node:timers/promises';
import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
} from '@aws-sdk/client-sqs';
import { createSqsClient } from '@premiumpass/aws-clients';
import { createLogger, readLogLevel } from '@premiumpass/logging';
import { consumeEvent } from './consumer.js';
import { ensureLocalEventQueue } from './local-queue.js';

const log = createLogger(
  readLogLevel(process.env),
  'premiumpass-event-consumer',
);
const sqs = createSqsClient({ local: true });
const stopping = new AbortController();
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => stopping.abort());
}

try {
  const queueUrl = await ensureLocalEventQueue(sqs);
  log.info({ event: 'event_consumer.started' });
  while (!stopping.signal.aborted) {
    try {
      const page = await sqs.send(
        new ReceiveMessageCommand({
          QueueUrl: queueUrl,
          MaxNumberOfMessages: 10,
          WaitTimeSeconds: 10,
        }),
        { abortSignal: stopping.signal },
      );
      for (const message of page.Messages ?? []) {
        try {
          consumeEvent(JSON.parse(message.Body ?? '') as unknown, log);
          await sqs.send(
            new DeleteMessageCommand({
              QueueUrl: queueUrl,
              ReceiptHandle: message.ReceiptHandle!,
            }),
          );
        } catch {
          log.warn({
            event: 'event_consumer.retry',
            messageId: message.MessageId,
          });
        }
      }
    } catch {
      if (!stopping.signal.aborted) {
        log.error({ event: 'event_consumer.queue_unavailable' });
        await setTimeout(1_000, undefined, { signal: stopping.signal }).catch(
          () => {},
        );
      }
    }
  }
} catch {
  log.error({ event: 'event_consumer.start_failed' });
  process.exitCode = 1;
} finally {
  sqs.destroy();
}
