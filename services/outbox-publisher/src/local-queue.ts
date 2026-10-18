import { randomUUID } from 'node:crypto';
import {
  CreateQueueCommand,
  GetQueueAttributesCommand,
  SendMessageBatchCommand,
  type SQSClient,
} from '@aws-sdk/client-sqs';
import { LOCAL_SQS_ENDPOINT } from '@premiumpass/aws-clients';
import { eventEnvelope, type SubscriptionChanged } from './events.js';
import type { EventSink } from './publisher.js';

// This is a local transport substitute, not an EventBridge emulator.
export async function ensureLocalEventQueue(client: SQSClient) {
  const dead = await client.send(
    new CreateQueueCommand({ QueueName: 'premiumpass-events-dlq' }),
  );
  const attributes = await client.send(
    new GetQueueAttributesCommand({
      QueueUrl: dead.QueueUrl!,
      AttributeNames: ['QueueArn'],
    }),
  );
  const queue = await client.send(
    new CreateQueueCommand({
      QueueName: 'premiumpass-events',
      Attributes: {
        VisibilityTimeout: '30',
        ReceiveMessageWaitTimeSeconds: '10',
        RedrivePolicy: JSON.stringify({
          deadLetterTargetArn: attributes.Attributes!.QueueArn,
          maxReceiveCount: 5,
        }),
      },
    }),
  );
  const url = queue.QueueUrl;
  if (!url || new URL(url).origin !== LOCAL_SQS_ENDPOINT) {
    throw new Error('Local event queue must use ElasticMQ on loopback.');
  }

  return url;
}

export class LocalQueueSink implements EventSink {
  private queueUrl: string | undefined;

  constructor(private readonly client: SQSClient) {}

  async publish(events: SubscriptionChanged[]) {
    this.queueUrl ??= await ensureLocalEventQueue(this.client);
    const envelopes = events.map((event) => eventEnvelope(event, randomUUID()));
    const response = await this.client
      .send(
        new SendMessageBatchCommand({
          QueueUrl: this.queueUrl,
          Entries: envelopes.map((envelope, index) => ({
            Id: String(index),
            MessageBody: JSON.stringify(envelope),
          })),
        }),
      )
      .catch((error: unknown) => {
        // Recreate the local queue on the next pass after a broker restart.
        this.queueUrl = undefined;
        throw error;
      });
    return envelopes.map((envelope, index) => {
      const id = String(index);
      const success = response.Successful?.some(
        (entry) => entry.Id === id && entry.MessageId,
      );
      const failed = response.Failed?.some((entry) => entry.Id === id);
      return success && !failed ? envelope.id : undefined;
    });
  }
}
