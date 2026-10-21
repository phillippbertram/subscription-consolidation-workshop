import {
  DeleteMessageCommand,
  GetQueueAttributesCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
  type SQSClient,
} from '@aws-sdk/client-sqs';
import { LOCAL_SQS_ENDPOINT } from '@premiumpass/aws-clients';
import {
  subscriptionJobSchema,
  type SubscriptionJob,
} from '@premiumpass/billing-contracts';
import type {
  AdminQueue,
  AdminRedriveResult,
} from '@premiumpass/api-contracts/admin';

// Fixed ElasticMQ queues from compose.yaml and the outbox publisher. Like the
// CLI, the console never derives queue URLs from settings that could name AWS.
const queueNames = {
  work: 'premiumpass-subscriptions',
  work_dlq: 'premiumpass-subscriptions-dlq',
  events: 'premiumpass-events',
  events_dlq: 'premiumpass-events-dlq',
} as const satisfies Record<AdminQueue['role'], string>;

function queueUrl(role: AdminQueue['role']) {
  return `${LOCAL_SQS_ENDPOINT}/000000000000/${queueNames[role]}`;
}

/**
 * Read approximate depths. The event queues exist only after the outbox
 * publisher created them, so an unreachable queue is reported, not thrown.
 */
export async function readQueues(sqs: SQSClient): Promise<AdminQueue[]> {
  const roles = Object.keys(queueNames) as AdminQueue['role'][];
  return Promise.all(
    roles.map(async (role) => {
      try {
        const { Attributes: attributes = {} } = await sqs.send(
          new GetQueueAttributesCommand({
            QueueUrl: queueUrl(role),
            AttributeNames: [
              'ApproximateNumberOfMessages',
              'ApproximateNumberOfMessagesNotVisible',
              'ApproximateNumberOfMessagesDelayed',
            ],
          }),
        );
        return {
          role,
          name: queueNames[role],
          available: true,
          visible: Number(attributes.ApproximateNumberOfMessages ?? 0),
          inFlight: Number(
            attributes.ApproximateNumberOfMessagesNotVisible ?? 0,
          ),
          delayed: Number(attributes.ApproximateNumberOfMessagesDelayed ?? 0),
        };
      } catch {
        return {
          role,
          name: queueNames[role],
          available: false,
          visible: 0,
          inFlight: 0,
          delayed: 0,
        };
      }
    }),
  );
}

/** ElasticMQ did not answer or did not confirm; the caller may simply retry. */
export class QueueUnavailableError extends Error {
  constructor(options?: ErrorOptions) {
    super('queue_unavailable', options);
    this.name = 'QueueUnavailableError';
  }
}

async function send<T>(operation: () => Promise<T>) {
  try {
    return await operation();
  } catch (error) {
    throw new QueueUnavailableError({ cause: error });
  }
}

/** Queue one validated job for the worker; a missing MessageId is not acceptance. */
export async function enqueueJob(sqs: SQSClient, job: SubscriptionJob) {
  const body = JSON.stringify(subscriptionJobSchema.parse(job));
  const response = await send(() =>
    sqs.send(
      new SendMessageCommand({ QueueUrl: queueUrl('work'), MessageBody: body }),
    ),
  );
  if (!response.MessageId) {
    throw new QueueUnavailableError();
  }
}

/**
 * Move dead-lettered jobs back to the work queue.
 *
 * Order matters: send the copy first, delete the original second. A crash in
 * between leaves the job in both queues, which is harmless because the worker
 * skips jobs whose completion marker exists. The reverse order could lose it.
 * Jobs carry references only, so the worker rereads provider state anyway.
 *
 * A preview receives with a zero visibility timeout: the messages stay visible
 * and nothing moves. It only raises their receive count in the DLQ.
 */
export async function redriveWorkDlq(
  sqs: SQSClient,
  dryRun: boolean,
): Promise<AdminRedriveResult> {
  const messages: AdminRedriveResult['messages'] = [];
  let moved = 0;
  // Ten batches of ten keep one request bounded; run it again for more.
  for (let batch = 0; batch < 10; batch++) {
    const { Messages: received = [] } = await send(() =>
      sqs.send(
        new ReceiveMessageCommand({
          QueueUrl: queueUrl('work_dlq'),
          MaxNumberOfMessages: 10,
          WaitTimeSeconds: 0,
          VisibilityTimeout: dryRun ? 0 : 60,
          MessageSystemAttributeNames: ['ApproximateReceiveCount'],
        }),
      ),
    );
    for (const message of received) {
      const {
        MessageId: messageId,
        Body: body,
        ReceiptHandle: receipt,
      } = message;
      if (!messageId || !body || !receipt) {
        continue;
      }

      messages.push({
        messageId,
        ...summarize(body),
        receiveCount: Number(message.Attributes?.ApproximateReceiveCount ?? 0),
      });
      if (dryRun) {
        continue;
      }

      // Forward the original body unchanged, even if it no longer parses: the
      // worker owns validation and dead-letters it again if it is malformed.
      // A failure stops the run; messages moved so far stay moved.
      await send(() =>
        sqs.send(
          new SendMessageCommand({
            QueueUrl: queueUrl('work'),
            MessageBody: body,
          }),
        ),
      );
      await send(() =>
        sqs.send(
          new DeleteMessageCommand({
            QueueUrl: queueUrl('work_dlq'),
            ReceiptHandle: receipt,
          }),
        ),
      );
      moved++;
    }

    // Zero-visibility previews return the same messages again; one batch is enough.
    if (dryRun || received.length < 10) {
      break;
    }
  }

  return { dryRun, moved, messages };
}

/** Show references only; a Google job's purchase token never leaves the API. */
function summarize(body: string) {
  const parsed = subscriptionJobSchema.safeParse(safeJson(body));
  if (!parsed.success) {
    return { provider: 'unknown', eventType: 'invalid job', eventId: '–' };
  }

  return {
    provider: parsed.data.provider,
    eventType: parsed.data.eventType,
    eventId: parsed.data.eventId,
  };
}

function safeJson(body: string): unknown {
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return undefined;
  }
}
