import { randomUUID } from 'node:crypto';
import { isPremiumSubscription } from '@premiumpass/domain';
import { z } from 'zod';
import { RevisionConflict } from '@premiumpass/subscription-processing';
import type { LocalSubscriptionStore } from './store.js';

export const editModes = ['free', 'active', 'expiring'] as const;
export type EditMode = (typeof editModes)[number];
export type EditOptions = { subscription?: string; until?: string };

export async function editSubscriptions(
  local: LocalSubscriptionStore,
  userId: string,
  mode: EditMode,
  options: EditOptions,
) {
  const { tableName, store, loadUser } = local;
  if (options.until && mode !== 'active') {
    throw new Error('--until is only supported with active.');
  }

  if (options.until && !z.iso.datetime().safeParse(options.until).success) {
    throw new Error(
      '--until must be a UTC ISO timestamp, e.g. 2026-12-01T12:00:00Z.',
    );
  }

  for (let attempt = 0; ; attempt++) {
    const now = new Date();
    const accessUntil =
      options.until ??
      new Date(
        now.getTime() +
          (mode === 'free' ? -1 : mode === 'expiring' ? 30_000 : 3_600_000),
      ).toISOString();
    if (mode === 'active' && Date.parse(accessUntil) <= now.getTime()) {
      throw new Error('--until must be in the future.');
    }

    const aggregate = await loadUser(userId);
    const selected = aggregate.subscriptions.filter(
      (s) =>
        !options.subscription ||
        s.providerSubscriptionId === options.subscription,
    );
    if (!selected.length) {
      throw new Error(
        'No matching subscriptions. Use seed to create demo records.',
      );
    }

    if (options.subscription && selected.length > 1) {
      throw new Error('Subscription ID is ambiguous across providers.');
    }

    if (selected.length > 97) {
      throw new Error(
        'Too many subscriptions for one transaction. Select one with --subscription.',
      );
    }

    if (mode !== 'free' && selected.some((s) => !isPremiumSubscription(s))) {
      throw new Error(
        'Cannot activate an unknown product. Select a Premium subscription.',
      );
    }

    const replacements = new Map(
      selected.map((s) => [
        s,
        {
          ...s,
          // Expire the access boundary without inventing a provider cancellation.
          ...(mode === 'free'
            ? {}
            : {
                state: 'active',
                providerStatus: s.provider === 'apple' ? '1' : 'active',
                cancelAtPeriodEnd: false,
              }),
          accessUntil,
          graceUntil: null,
          revision: s.revision + 1,
        },
      ]),
    );
    const subscriptions = aggregate.subscriptions.map(
      (s) => replacements.get(s) ?? s,
    );
    const writes = selected.map((previous) => {
      const next = replacements.get(previous)!;
      return {
        Update: {
          TableName: tableName,
          Key: {
            pk: `USER#${userId}`,
            sk: `SUB#${previous.provider}#${previous.providerSubscriptionId}`,
          },
          UpdateExpression:
            'SET #state = :state, providerStatus = :status, cancelAtPeriodEnd = :cancel, accessUntil = :until, graceUntil = :grace, revision = :next',
          ConditionExpression: 'userId = :user AND revision = :previous',
          ExpressionAttributeNames: { '#state': 'state' },
          ExpressionAttributeValues: {
            ':state': next.state,
            ':status': next.providerStatus,
            ':cancel': next.cancelAtPeriodEnd,
            ':until': next.accessUntil,
            ':grace': next.graceUntil,
            ':next': next.revision,
            ':user': userId,
            ':previous': previous.revision,
          },
        },
      };
    });
    try {
      await store.commit(aggregate, subscriptions, writes, now, {
        eventId: `local-edit-${randomUUID()}`,
        correlationId: randomUUID(),
      });
      return { count: selected.length, subscriptions };
    } catch (error) {
      if (!(error instanceof RevisionConflict) || attempt >= 2) {
        throw error;
      }
    }
  }
}
