import type {
  AdminMarker,
  AdminOutboxEntry,
  AdminState,
} from '@premiumpass/api-contracts/admin';

/** One line in a feed or a user's timeline, built from different record types. */
export interface ActivityItem {
  id: string;
  at: string;
  kind: string;
  provider: string;
  title: string;
  detail: string;
  userId: string | null;
  outbox: AdminOutboxEntry | null;
}

/**
 * Find the outbox entry a commit wrote. Provider jobs store their event ID in
 * providerEventId (Apple and Google with a prefix); admin grants use the
 * request ID as correlation ID. No entry means access did not change.
 */
export function outboxForMarker(
  outbox: AdminOutboxEntry[],
  marker: AdminMarker,
) {
  return (
    outbox.find(
      (entry) =>
        entry.userId === marker.userId &&
        (entry.providerEventId === marker.eventId ||
          entry.providerEventId.endsWith(`:${marker.eventId}`)),
    ) ?? null
  );
}

export function outboxForAudit(outbox: AdminOutboxEntry[], requestId: string) {
  return outbox.find((entry) => entry.correlationId === requestId) ?? null;
}

/** Markers, admin audits, outbox publications, and checkouts, newest first. */
export function activityFeed(
  state: AdminState,
  userId?: string,
): ActivityItem[] {
  const items: ActivityItem[] = [];
  for (const marker of state.markers) {
    if (userId && marker.userId !== userId) {
      continue;
    }

    items.push({
      id: marker.key,
      at: marker.processedAt,
      kind: 'Processed job',
      provider: marker.provider,
      title: marker.eventType ?? 'job',
      detail: [
        marker.outcome,
        marker.completion === 'pending' ? 'store completion pending' : null,
      ]
        .filter(Boolean)
        .join(' · '),
      userId: marker.userId,
      outbox: outboxForMarker(state.outbox, marker),
    });
  }

  for (const user of state.users) {
    if (userId && user.userId !== userId) {
      continue;
    }

    for (const entry of user.audit) {
      items.push({
        id: `audit-${entry.requestId}`,
        at: entry.at,
        kind: 'Admin grant',
        provider: 'admin',
        title: `${entry.action} complimentary Premium`,
        detail: `${entry.outcome} · ${entry.reason}`,
        userId: user.userId,
        outbox: outboxForAudit(state.outbox, entry.requestId),
      });
    }

    for (const checkout of user.checkouts) {
      items.push({
        id: `checkout-${checkout.requestId}`,
        at: checkout.createdAt,
        kind: 'Checkout started',
        provider: 'stripe',
        title: checkout.planId,
        detail: checkout.sessionId
          ? `session ${checkout.sessionId}; payment is not proven by this record`
          : 'no session yet',
        userId: user.userId,
        outbox: null,
      });
    }
  }

  for (const entry of state.outbox) {
    if (entry.sentAt && (!userId || entry.userId === userId)) {
      items.push({
        id: `sent-${entry.domainEventId}`,
        at: entry.sentAt,
        kind: 'Outbox sent',
        provider: 'outbox',
        title: entry.domainEventId,
        detail: 'accepted by the event queue',
        userId: entry.userId,
        outbox: null,
      });
    }
  }

  return items.sort((a, b) => b.at.localeCompare(a.at));
}
