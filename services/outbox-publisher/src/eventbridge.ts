import {
  DescribeEventBusCommand,
  PutEventsCommand,
  type EventBridgeClient,
} from '@aws-sdk/client-eventbridge';
import { EVENT_SOURCE, type SubscriptionChanged } from './events.js';
import type { EventSink } from './publisher.js';

export class EventBridgeSink implements EventSink {
  constructor(
    private readonly client: EventBridgeClient,
    private readonly busName: string,
  ) {}

  async publish(events: SubscriptionChanged[]) {
    // PutEvents can report success for a nonexistent bus. Verify the explicit
    // target before each batch; accepted events still do not prove delivery.
    await this.client.send(new DescribeEventBusCommand({ Name: this.busName }));
    const response = await this.client.send(
      new PutEventsCommand({
        Entries: events.map((event) => ({
          EventBusName: this.busName,
          Source: EVENT_SOURCE,
          DetailType: event.type,
          Time: new Date(event.createdAt),
          Detail: JSON.stringify(event),
        })),
      }),
    );
    return events.map((_, index) => {
      const entry = response.Entries?.[index];
      return entry && !entry.ErrorCode && !entry.ErrorMessage
        ? entry.EventId
        : undefined;
    });
  }
}
