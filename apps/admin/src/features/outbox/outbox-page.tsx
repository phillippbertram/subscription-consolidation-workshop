import { useState } from 'react';
import type {
  AdminOutboxEntry,
  AdminState,
} from '@premiumpass/api-contracts/admin';
import {
  EmptyRow,
  Mono,
  Pill,
  Section,
  TableFrame,
  Td,
  Th,
  TierBadge,
} from '@/components/status';
import { formatAge, formatDateTime, shortId } from '@/lib/format';
import { AppLink, userPath } from '@/lib/navigation';
import { cn } from '@/lib/utils';

type StatusFilter = 'all' | 'pending' | 'sent';

export function OutboxPage({ state }: { state: AdminState }) {
  const [filter, setFilter] = useState<StatusFilter>('all');
  const pending = state.outbox.filter((entry) => entry.status === 'pending');
  const entries = state.outbox.filter(
    (entry) => filter === 'all' || entry.status === filter,
  );
  const [selectedId, setSelectedId] = useState<string | null>(
    pending.at(-1)?.domainEventId ?? state.outbox[0]?.domainEventId ?? null,
  );
  const selected =
    state.outbox.find((entry) => entry.domainEventId === selectedId) ?? null;
  const lastSent = state.outbox
    .flatMap((entry) => (entry.sentAt ? [entry.sentAt] : []))
    .sort()
    .at(-1);
  const waiting = state.checks.find(
    (check) => check.id === 'outbox_waiting' && check.severity !== 'ok',
  );

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Outbox</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Every change to a user's access is saved together with an outbox entry
          in one transaction. The separate publisher announces it later and
          marks it sent. Access never waits for this page.
        </p>
      </div>

      {waiting && (
        <section className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border border-warning/40 bg-warning/5 px-5 py-4">
          <div className="min-w-72 flex-1">
            <p className="font-semibold text-warning">
              The publisher seems to be stopped
            </p>
            <p className="text-sm text-muted-foreground">
              {pending.length} pending; last publication{' '}
              {lastSent ? formatDateTime(lastSent) : 'never'}. The console never
              publishes itself, so you can watch this separate step.
            </p>
          </div>
          <code className="rounded-lg bg-foreground px-3 py-2 font-mono text-sm text-background">
            pnpm dev:outbox
          </code>
        </section>
      )}

      <div
        role="group"
        aria-label="Filter by status"
        className="flex w-fit gap-1 rounded-lg bg-muted p-1"
      >
        {(['all', 'pending', 'sent'] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
            className={cn(
              'h-8 rounded-md px-3 text-sm font-medium text-muted-foreground capitalize',
              filter === value && 'bg-card text-foreground shadow-sm',
            )}
          >
            {value}{' '}
            {value === 'all'
              ? state.outbox.length
              : value === 'pending'
                ? pending.length
                : state.outbox.length - pending.length}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-start gap-6">
        <Section
          className="flex-[999_1_600px]"
          title="Entries"
          hint="domainEventId is userId:revision and stays the same across retries."
        >
          {entries.length ? (
            <TableFrame>
              <thead>
                <tr>
                  <Th>Entry</Th>
                  <Th>Status</Th>
                  <Th>Change</Th>
                  <Th>Created</Th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr
                    key={entry.domainEventId}
                    className={cn(
                      entry.domainEventId === selectedId && 'bg-secondary/50',
                    )}
                  >
                    <Td>
                      <button
                        type="button"
                        onClick={() => setSelectedId(entry.domainEventId)}
                        className="text-left font-mono text-xs font-medium text-primary underline-offset-4 hover:underline"
                      >
                        {shortId(entry.userId)}…:{entry.revision}
                      </button>
                    </Td>
                    <Td>
                      <StatusPill entry={entry} />
                      <span className="block text-xs text-muted-foreground">
                        {entry.sentAt
                          ? formatDateTime(entry.sentAt)
                          : `waiting ${formatAge(entry.createdAt, state.readAt)}`}
                      </span>
                    </Td>
                    <Td>
                      <ChangeText entry={entry} />
                      <Mono className="block text-muted-foreground">
                        {entry.providerEventId}
                      </Mono>
                    </Td>
                    <Td className="text-xs whitespace-nowrap">
                      {formatDateTime(entry.createdAt)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableFrame>
          ) : (
            <EmptyRow>No outbox entries in this filter.</EmptyRow>
          )}
        </Section>

        {selected && <EntryDetail entry={selected} state={state} />}
      </div>
    </>
  );
}

function EntryDetail({
  entry,
  state,
}: {
  entry: AdminOutboxEntry;
  state: AdminState;
}) {
  const sent = entry.status === 'sent';
  const steps = [
    {
      done: true,
      title: 'Committed with the change',
      detail: `${formatDateTime(entry.createdAt)} · same transaction as the snapshot (rev ${entry.revision}) and the job's marker`,
    },
    {
      done: sent,
      title: 'Publisher sends it to the event queue',
      detail: sent
        ? `accepted ${formatDateTime(entry.sentAt)}`
        : `pending for ${formatAge(entry.createdAt, state.readAt)}`,
    },
    {
      done: sent,
      title: 'Marked sent',
      detail:
        'status, sentAt, and publishedEventId are set only after acceptance',
    },
  ];

  return (
    <Section
      className="flex-[1_1_380px]"
      title={<Mono className="text-sm">{entry.domainEventId}</Mono>}
      hint={`OUTBOX#${entry.domainEventId} / EVENT · SubscriptionChanged`}
    >
      <ol className="space-y-3 px-5 py-4">
        {steps.map((step) => (
          <li key={step.title} className="flex gap-3">
            <Pill
              className={cn(
                'min-w-16 justify-center',
                step.done
                  ? 'bg-success/10 text-success'
                  : 'bg-warning/10 text-warning',
              )}
            >
              {step.done ? 'Done' : 'Waiting'}
            </Pill>
            <div>
              <p className="text-sm font-medium">{step.title}</p>
              <p className="text-xs text-muted-foreground">{step.detail}</p>
            </div>
          </li>
        ))}
        <li className="flex gap-3">
          <Pill className="min-w-16 justify-center bg-muted text-muted-foreground">
            Not visible
          </Pill>
          <div>
            <p className="text-sm font-medium">Consumer logs the change</p>
            <p className="text-xs text-muted-foreground">
              Outside the database; follow it in the pnpm dev:events terminal.
            </p>
          </div>
        </li>
      </ol>
      <div className="space-y-1.5 border-t px-5 py-4 text-sm">
        <p className="font-semibold">What changed</p>
        <ChangeText entry={entry} />
        <p className="text-xs text-muted-foreground">
          {entry.grants} grant(s) · effectiveUntil{' '}
          {formatDateTime(entry.effectiveUntil)} · correlation{' '}
          <Mono>{entry.correlationId}</Mono> · user{' '}
          <AppLink
            to={userPath(entry.userId)}
            className="font-mono text-primary underline"
          >
            {shortId(entry.userId)}
          </AppLink>
        </p>
      </div>
      <p className="mx-5 mb-5 rounded-lg bg-info/5 p-3 text-xs text-info">
        “Sent” means the event queue accepted the entry, not that a consumer
        processed it. A crash between sending and marking can publish twice;
        both copies keep the same domainEventId.
      </p>
    </Section>
  );
}

function StatusPill({ entry }: { entry: AdminOutboxEntry }) {
  return (
    <Pill
      className={
        entry.status === 'sent'
          ? 'bg-success/10 text-success'
          : 'bg-warning/10 text-warning'
      }
    >
      {entry.status}
    </Pill>
  );
}

function ChangeText({ entry }: { entry: AdminOutboxEntry }) {
  return (
    <span className="flex flex-wrap items-center gap-1.5 text-sm">
      {entry.previousTier ? (
        <TierBadge tier={entry.previousTier} />
      ) : (
        <span className="text-xs text-muted-foreground">first entry</span>
      )}
      <span aria-hidden>→</span>
      <TierBadge tier={entry.tier} />
      {entry.effectiveUntil && (
        <span className="text-xs text-muted-foreground">
          until {formatDateTime(entry.effectiveUntil)}
        </span>
      )}
    </span>
  );
}
