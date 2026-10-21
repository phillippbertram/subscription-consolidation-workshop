import { ArrowRight } from 'lucide-react';
import type { AdminQueue, AdminState } from '@premiumpass/api-contracts/admin';
import {
  Mono,
  ProviderBadge,
  Section,
  SeverityBadge,
  TableFrame,
  Td,
  Th,
} from '@/components/status';
import { formatAge, formatDateTime, shortId } from '@/lib/format';
import { AppLink, userPath } from '@/lib/navigation';
import { cn } from '@/lib/utils';
import { activityFeed } from '../activity';

export function OverviewPage({ state }: { state: AdminState }) {
  const premium = state.users.filter((user) => user.access.tier === 'premium');
  const subscriptions = state.users.flatMap((user) => user.subscriptions);
  const granting = subscriptions.filter(
    (subscription) => subscription.evaluation.result === 'grants',
  );
  const pending = state.outbox.filter((entry) => entry.status === 'pending');
  const oldestPending = pending.at(-1);
  const queue = (role: AdminQueue['role']) =>
    state.queues.find((candidate) => candidate.role === role);
  const deadLetters = ['work_dlq', 'events_dlq'].reduce((sum, role) => {
    const dlq = queue(role as AdminQueue['role']);
    return sum + (dlq ? dlq.visible + dlq.inFlight + dlq.delayed : 0);
  }, 0);
  const attention = state.checks.filter((check) => check.severity !== 'ok');

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          What the backend knows right now. Every number on these pages comes
          from one read at {formatDateTime(state.readAt)}; access is computed
          from the stored records and that moment, exactly like the API does.
        </p>
      </div>

      <section
        aria-label="Key numbers"
        className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-4"
      >
        <Kpi
          to="/users"
          label="Users"
          value={state.users.length}
          sub={`${premium.length} Premium · ${state.users.length - premium.length} Free`}
        />
        <Kpi
          to="/users"
          label="Premium right now"
          value={premium.length}
          sub="computed from records and the clock"
          tone="primary"
        />
        <Kpi
          to="/users"
          label="Subscriptions"
          value={subscriptions.length}
          sub={`${granting.length} grant access now`}
        />
        <Kpi
          to="/outbox"
          label="Outbox pending"
          value={pending.length}
          sub={
            oldestPending
              ? `oldest waits ${formatAge(oldestPending.createdAt, state.readAt)}`
              : 'every change announced'
          }
          tone={pending.length ? 'warning' : undefined}
        />
        <Kpi
          to="/processing"
          label="Dead letters"
          value={deadLetters}
          sub="work and event DLQ"
          tone={deadLetters ? 'destructive' : undefined}
        />
      </section>

      <Section
        title="Pipeline"
        hint="The path of one change, with live counts. Webhooks only enqueue references; the worker verifies and commits; the outbox announces afterwards."
      >
        <div className="flex flex-wrap items-stretch gap-2 p-5">
          <Step
            n="1"
            title="Webhooks, app sync"
            line="Stripe · Apple · Google"
            note="verify, enqueue reference"
          />
          <Step
            n="2"
            title="Work queue"
            line={queueLine(queue('work'))}
            note={`DLQ: ${queueCount(queue('work_dlq'))}`}
            warn={
              queueCount(queue('work_dlq')) > 0 || !queue('work')?.available
            }
            to="/processing"
          />
          <Step
            n="3"
            title="Worker"
            line={
              state.markers[0]
                ? `last commit ${formatAge(state.markers[0].processedAt, state.readAt)} ago`
                : 'no job processed yet'
            }
            note="reads provider state"
            to="/processing"
          />
          <Step
            n="4"
            title="DynamoDB"
            line={`${state.recordCount} records · ${state.users.length} users`}
            note="state + marker + outbox"
            to="/users"
          />
          <Step
            n="5"
            title="Outbox"
            line={`${state.outbox.length - pending.length} sent · ${pending.length} pending`}
            note="pnpm dev:outbox publishes"
            warn={state.checks.some(
              (check) =>
                check.id === 'outbox_waiting' && check.severity !== 'ok',
            )}
            to="/outbox"
          />
          <Step
            n="6"
            title="Event queue"
            line={queueLine(queue('events'))}
            note={`DLQ: ${queueCount(queue('events_dlq'))}`}
            to="/processing"
          />
          <Step
            n="7"
            title="Log consumer"
            line="not visible here"
            note="see pnpm dev:events"
            last
          />
        </div>
        <p className="border-t border-dashed px-5 py-3 text-xs text-muted-foreground">
          <strong className="font-semibold text-foreground">API</strong> reads
          DynamoDB and the clock and never waits for the outbox.{' '}
          <strong className="font-semibold text-foreground">
            CLI and this console
          </strong>{' '}
          write through the same guarded transaction as the worker.
        </p>
      </Section>

      <Section
        title="Consistency checks"
        hint="Rules over all records and the queues. They look for the risks the code review rules name."
        action={
          <span className="self-center text-xs text-muted-foreground">
            {state.checks.length - attention.length} OK · {attention.length}{' '}
            need attention
          </span>
        }
      >
        <ul>
          {[
            ...attention,
            ...state.checks.filter((c) => c.severity === 'ok'),
          ].map((check) => (
            <li
              key={check.id}
              className="flex flex-wrap items-start gap-3 border-t border-muted px-5 py-3 first:border-t-0"
            >
              <SeverityBadge severity={check.severity} />
              <div className="min-w-0 flex-1 basis-80">
                <p className="font-medium">{check.title}</p>
                <p className="text-sm text-muted-foreground">{check.detail}</p>
                {check.userIds.length > 0 && (
                  <p className="mt-1 flex flex-wrap gap-2 text-xs">
                    {check.userIds.map((userId) => (
                      <AppLink
                        key={userId}
                        to={userPath(userId)}
                        className="font-mono text-primary underline-offset-4 hover:underline"
                      >
                        {shortId(userId)}
                      </AppLink>
                    ))}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        title="Recent activity"
        hint="Processed jobs, admin audits, checkouts, and outbox publications, newest first."
      >
        <ActivityTable state={state} />
      </Section>
    </>
  );
}

function ActivityTable({ state }: { state: AdminState }) {
  const items = activityFeed(state).slice(0, 12);
  if (!items.length) {
    return (
      <p className="px-5 py-6 text-center text-sm text-muted-foreground">
        Nothing yet. Sign in on the website to create a profile.
      </p>
    );
  }

  return (
    <TableFrame>
      <thead>
        <tr>
          <Th>When</Th>
          <Th>Kind</Th>
          <Th>What happened</Th>
          <Th>User</Th>
          <Th>Announced</Th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.id}>
            <Td className="whitespace-nowrap">
              <Mono>{formatDateTime(item.at)}</Mono>
            </Td>
            <Td>
              <span className="flex items-center gap-2">
                <ProviderBadge provider={item.provider} />
                <span className="text-xs text-muted-foreground">
                  {item.kind}
                </span>
              </span>
            </Td>
            <Td>
              <span className="font-mono text-xs">{item.title}</span>
              {item.detail && (
                <span className="block text-xs text-muted-foreground">
                  {item.detail}
                </span>
              )}
            </Td>
            <Td>
              {item.userId ? (
                <AppLink
                  to={userPath(item.userId)}
                  className="font-mono text-xs text-primary underline-offset-4 hover:underline"
                >
                  {shortId(item.userId)}
                </AppLink>
              ) : (
                <span className="text-xs text-muted-foreground">–</span>
              )}
            </Td>
            <Td className="text-xs">
              {item.outbox ? (
                <span
                  className={
                    item.outbox.status === 'sent'
                      ? 'text-success'
                      : 'text-warning'
                  }
                >
                  {item.outbox.status}
                </span>
              ) : (
                <span className="text-muted-foreground">–</span>
              )}
            </Td>
          </tr>
        ))}
      </tbody>
    </TableFrame>
  );
}

function Kpi({
  to,
  label,
  value,
  sub,
  tone,
}: {
  to: string;
  label: string;
  value: number;
  sub: string;
  tone?: 'primary' | 'warning' | 'destructive' | undefined;
}) {
  return (
    <AppLink
      to={to}
      className="flex flex-col gap-1 rounded-xl border bg-card px-4 py-4 transition-colors hover:border-ring/40"
    >
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <span
        className={cn(
          'text-3xl font-semibold',
          tone === 'primary' && 'text-primary',
          tone === 'warning' && 'text-warning',
          tone === 'destructive' && 'text-destructive',
        )}
      >
        {value}
      </span>
      <span className="text-xs text-muted-foreground">{sub}</span>
    </AppLink>
  );
}

function Step({
  n,
  title,
  line,
  note,
  warn,
  to,
  last,
}: {
  n: string;
  title: string;
  line: string;
  note: string;
  warn?: boolean;
  to?: string;
  last?: boolean;
}) {
  const body = (
    <>
      <span className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
        Step {n}
      </span>
      <span className="font-semibold">{title}</span>
      <span className="text-xs">{line}</span>
      <span
        className={cn(
          'text-xs font-medium',
          warn ? 'text-warning' : 'text-muted-foreground',
        )}
      >
        {note}
      </span>
    </>
  );
  const boxClass = cn(
    'flex w-40 flex-col gap-0.5 rounded-lg border p-3',
    warn ? 'border-warning/40 bg-warning/5' : 'bg-background',
  );

  return (
    <div className="flex items-center gap-2">
      {to ? (
        <AppLink to={to} className={cn(boxClass, 'hover:border-ring/40')}>
          {body}
        </AppLink>
      ) : (
        <div className={boxClass}>{body}</div>
      )}
      {!last && (
        <ArrowRight className="size-4 text-muted-foreground" aria-hidden />
      )}
    </div>
  );
}

function queueCount(queue: AdminQueue | undefined) {
  return queue ? queue.visible + queue.inFlight + queue.delayed : 0;
}

function queueLine(queue: AdminQueue | undefined) {
  if (!queue?.available) {
    return 'not available';
  }

  return `${queue.visible} waiting · ${queue.inFlight} in flight`;
}
