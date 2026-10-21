import { useState } from 'react';
import type {
  AdminQueue,
  AdminRedriveResult,
  AdminState,
} from '@premiumpass/api-contracts/admin';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  EmptyRow,
  Mono,
  Pill,
  ProviderBadge,
  Section,
  TableFrame,
  Td,
  Th,
} from '@/components/status';
import { AdminApiError, type AdminClient } from '@/api/admin-client';
import { formatDateTime, shortId } from '@/lib/format';
import { AppLink, userPath } from '@/lib/navigation';
import { cn } from '@/lib/utils';

const queueRoles: Record<AdminQueue['role'], string> = {
  work: 'Work queue',
  work_dlq: 'Work DLQ',
  events: 'Event queue',
  events_dlq: 'Event DLQ',
};

const queueNotes: Record<AdminQueue['role'], string> = {
  work: 'Webhooks, app sync, reconciliation, and this console queue jobs here.',
  work_dlq: 'Jobs that failed five times.',
  events: 'Filled by the outbox publisher, read by the log consumer.',
  events_dlq: 'Events the consumer failed five times.',
};

export function ProcessingPage({
  state,
  client,
  onChanged,
}: {
  state: AdminState;
  client: AdminClient;
  onChanged: () => Promise<void>;
}) {
  const [completionOnly, setCompletionOnly] = useState(false);
  const markers = state.markers.filter(
    (marker) => !completionOnly || marker.completion === 'pending',
  );

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Processing</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          What the worker did and whether anything is stuck. Queue numbers come
          from ElasticMQ; markers come from DynamoDB. A marker commits with the
          change, so a duplicate job finds it and writes nothing.
        </p>
      </div>

      <section
        aria-label="Queues"
        className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4"
      >
        {state.queues.map((queue) => (
          <QueueCard key={queue.role} queue={queue} />
        ))}
      </section>

      <RedriveSection client={client} onChanged={onChanged} />

      <Section
        title={`Processing markers · ${state.markers.length}`}
        hint="One per committed job. Apple and Google need one more provider call after the commit; its status is shown last."
        action={
          <label className="flex items-center gap-2 self-center text-sm font-medium">
            <input
              type="checkbox"
              checked={completionOnly}
              onChange={(event) => setCompletionOnly(event.target.checked)}
              className="size-4 accent-primary"
            />
            Completion pending only
          </label>
        }
      >
        {markers.length ? (
          <TableFrame>
            <thead>
              <tr>
                <Th>Marker key</Th>
                <Th>Event type</Th>
                <Th>User</Th>
                <Th>Outcome</Th>
                <Th>Committed</Th>
                <Th>Store completion</Th>
              </tr>
            </thead>
            <tbody>
              {markers.map((marker) => (
                <tr key={marker.key}>
                  <Td>
                    <Mono>{marker.key}</Mono>
                  </Td>
                  <Td>
                    <span className="flex items-center gap-2">
                      <ProviderBadge provider={marker.provider} />
                      <Mono>{marker.eventType ?? '–'}</Mono>
                    </span>
                  </Td>
                  <Td>
                    {marker.userId ? (
                      <AppLink
                        to={userPath(marker.userId)}
                        className="font-mono text-xs text-primary underline-offset-4 hover:underline"
                      >
                        {shortId(marker.userId)}
                      </AppLink>
                    ) : (
                      '–'
                    )}
                  </Td>
                  <Td className="text-xs">{marker.outcome ?? '–'}</Td>
                  <Td className="text-xs whitespace-nowrap">
                    {formatDateTime(marker.processedAt)}
                  </Td>
                  <Td className="text-xs">
                    {marker.completion === 'pending' && (
                      <span className="font-medium text-warning">Pending</span>
                    )}
                    {marker.completion === 'done' && (
                      <span className="text-success">
                        Done {formatDateTime(marker.completedAt)}
                      </span>
                    )}
                    {marker.completion === 'not_needed' && (
                      <span className="text-muted-foreground">Not needed</span>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableFrame>
        ) : (
          <EmptyRow>No markers in this filter.</EmptyRow>
        )}
      </Section>

      <Section
        title={`Unrecognized records · ${state.unrecognized.length}`}
        hint="Items that match no known key pattern or fail their schema. They are shown, never silently dropped."
      >
        {state.unrecognized.length ? (
          <ul className="divide-y divide-muted">
            {state.unrecognized.map((item) => (
              <li
                key={`${item.pk}|${item.sk}`}
                className="flex flex-wrap gap-x-4 px-5 py-2 text-xs"
              >
                <Mono>
                  {item.pk} / {item.sk}
                </Mono>
                <span className="text-warning">{item.reason}</span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyRow>Every item matches a known record type.</EmptyRow>
        )}
      </Section>
    </>
  );
}

function QueueCard({ queue }: { queue: AdminQueue }) {
  const isDlq = queue.role.endsWith('_dlq');
  const total = queue.visible + queue.inFlight + queue.delayed;
  const alarm = isDlq && total > 0;

  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-xl border bg-card p-4',
        alarm && 'border-destructive/40',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-muted-foreground">
          {queueRoles[queue.role]}
        </span>
        <Pill
          className={cn(
            !queue.available && 'bg-muted text-muted-foreground',
            queue.available && alarm && 'bg-destructive/10 text-destructive',
            queue.available && !alarm && 'bg-success/10 text-success',
          )}
        >
          {!queue.available
            ? 'Not available'
            : alarm
              ? 'Needs attention'
              : 'OK'}
        </Pill>
      </div>
      <Mono className="text-sm font-medium">{queue.name}</Mono>
      {queue.available ? (
        <div className="flex gap-5">
          {(
            [
              ['waiting', queue.visible],
              ['in flight', queue.inFlight],
              ['delayed', queue.delayed],
            ] as const
          ).map(([label, value]) => (
            <div key={label}>
              <span className="block text-2xl font-semibold">{value}</span>
              <span className="block text-xs text-muted-foreground">
                {label}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {queue.role.startsWith('events')
            ? 'Created on demand when the outbox publisher first runs.'
            : 'ElasticMQ does not answer. Start it with pnpm local:up.'}
        </p>
      )}
      <p className="text-xs text-muted-foreground">{queueNotes[queue.role]}</p>
    </div>
  );
}

/** Preview the dead letters, then move them back to the work queue. */
function RedriveSection({
  client,
  onChanged,
}: {
  client: AdminClient;
  onChanged: () => Promise<void>;
}) {
  const [result, setResult] = useState<AdminRedriveResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(dryRun: boolean) {
    setBusy(true);
    setError(null);
    try {
      setResult(await client.redrive(dryRun));
      if (!dryRun) {
        await onChanged();
      }
    } catch (caught) {
      setError(
        caught instanceof AdminApiError
          ? caught.message
          : 'The request failed. Check the API log.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section
      title="Redrive the work DLQ"
      hint="Jobs carry references only and the worker rereads provider state, so moving them back is safe. Fix the cause first (see the worker log), or they return here after five more failures."
      action={
        <div className="flex gap-2 self-center">
          {result?.dryRun && result.messages.length > 0 ? (
            <Button size="lg" disabled={busy} onClick={() => void run(false)}>
              Move {result.messages.length} message(s)
            </Button>
          ) : (
            <Button
              size="lg"
              variant="outline"
              disabled={busy}
              onClick={() => void run(true)}
            >
              Preview dead letters
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-2 px-5 py-4 text-sm">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {!result && !error && (
          <p className="text-muted-foreground">
            Preview lists the messages without moving them.
          </p>
        )}
        {result && (
          <>
            <p
              className={
                result.dryRun
                  ? 'font-medium text-info'
                  : 'font-medium text-success'
              }
            >
              {result.dryRun
                ? `Preview · ${result.messages.length} message(s), nothing moved`
                : `Moved ${result.moved} message(s) to the work queue.`}
            </p>
            <ul className="space-y-1 text-xs">
              {result.messages.map((message) => (
                <li key={message.messageId}>
                  <span className="font-semibold">{message.provider}</span>{' '}
                  <Mono>{message.eventType}</Mono> ·{' '}
                  <Mono>{message.eventId}</Mono> · received{' '}
                  {message.receiveCount}×
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Section>
  );
}
