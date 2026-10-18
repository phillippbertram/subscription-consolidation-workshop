import type { Logger } from 'pino';
import type { SubscriptionChanged } from './events.js';
import type { OutboxStore } from './store.js';

export interface EventSink {
  // One result per input, in order. Missing receipts are never success.
  publish(events: SubscriptionChanged[]): Promise<(string | undefined)[]>;
}

/**
 * Publish first, mark sent second: a crash between them can duplicate an event,
 * but reversing the order could lose it. Consumers with business side effects
 * must make those effects idempotent using the stable domainEventId.
 */
export async function publishOutbox(
  store: OutboxStore,
  sink: EventSink,
  log: Logger,
  options: { dryRun?: boolean; signal?: AbortSignal; now?: () => Date } = {},
) {
  const summary = {
    selected: 0,
    sent: 0,
    alreadySent: 0,
    failed: 0,
    invalid: 0,
  };
  for await (const page of store.pending()) {
    summary.invalid += page.invalid;
    if (page.invalid) {
      log.error({ event: 'outbox.invalid_records', count: page.invalid });
    }

    for (let offset = 0; offset < page.events.length; offset += 10) {
      if (options.signal?.aborted) {
        return summary;
      }

      const batch = page.events.slice(offset, offset + 10);
      summary.selected += batch.length;
      if (options.dryRun) {
        for (const event of batch) {
          log.info({
            event: 'outbox.preview',
            domainEventId: event.domainEventId,
          });
        }

        continue;
      }

      let receipts: (string | undefined)[];
      try {
        receipts = await sink.publish(batch);
      } catch {
        summary.failed += batch.length;
        log.error({ event: 'outbox.publish_failed', count: batch.length });
        continue;
      }

      for (const [index, event] of batch.entries()) {
        // Batch transport success is not success for every entry. Only a receipt
        // for this exact position permits its sent marker; other entries retry.
        const receipt =
          receipts.length === batch.length ? receipts[index] : undefined;
        const fields = {
          domainEventId: event.domainEventId,
          correlationId: event.correlationId,
        };
        if (!receipt) {
          summary.failed++;
          log.warn({ event: 'outbox.entry_rejected', ...fields });
          continue;
        }

        try {
          const changed = await store.markSent(
            event,
            receipt,
            (options.now ?? (() => new Date()))(),
          );
          if (changed) {
            summary.sent++;
          } else {
            summary.alreadySent++;
          }

          log.info({
            event: 'outbox.sent',
            ...fields,
            publishedEventId: receipt,
          });
        } catch {
          // Acceptance may already have happened. Retry the same domain ID.
          summary.failed++;
          log.error({ event: 'outbox.mark_failed', ...fields });
        }
      }
    }

    if (options.signal?.aborted) {
      return summary;
    }
  }

  return summary;
}
