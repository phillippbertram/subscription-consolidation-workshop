import { useState, type ReactNode } from 'react';
import type {
  AdminGrantView,
  AdminPremiumResult,
  AdminRunResult,
  AdminUser,
} from '@premiumpass/api-contracts/admin';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Mono, Pill } from '@/components/status';
import { AdminApiError, type AdminClient } from '@/api/admin-client';
import { formatDateTime } from '@/lib/format';

/**
 * Every write follows the same steps: preview without writes, then apply with
 * the same request ID, then show what changed. The ID is created when the
 * form opens and renewed after an applied change, so a double click replays
 * the stored receipt instead of writing twice.
 */
export function PremiumAction({
  user,
  client,
  onChanged,
}: {
  user: AdminUser;
  client: AdminClient;
  onChanged: () => Promise<void>;
}) {
  const active = user.adminGrant?.state === 'active';
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [action, setAction] = useState<'grant' | 'revoke'>(
    active ? 'revoke' : 'grant',
  );
  const [forever, setForever] = useState(true);
  const [until, setUntil] = useState('');
  const [reason, setReason] = useState('');
  const [preview, setPreview] = useState<AdminPremiumResult | null>(null);
  const [applied, setApplied] = useState<AdminPremiumResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Any edit invalidates the preview: apply must send exactly what was shown.
  function edit(change: () => void) {
    change();
    setPreview(null);
    setApplied(null);
    setError(null);
  }

  function input(dryRun: boolean) {
    return {
      requestId,
      action,
      expiresAt:
        action === 'grant' && !forever && until
          ? new Date(until).toISOString()
          : null,
      reason,
      dryRun,
    };
  }

  async function run(dryRun: boolean) {
    setBusy(true);
    setError(null);
    try {
      const result = await client.premium(user.userId, input(dryRun));
      if (dryRun) {
        setPreview(result);
        return;
      }

      setApplied(result);
      setPreview(null);
      setReason('');
      setRequestId(crypto.randomUUID());
      await onChanged();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  const needsDate = action === 'grant' && !forever && !until;

  return (
    <ActionCard
      title="Complimentary Premium"
      status={
        <Pill
          className={
            active
              ? 'bg-secondary text-secondary-foreground'
              : 'bg-muted text-muted-foreground'
          }
        >
          {active
            ? user.adminGrant?.expiresAt
              ? `Active until ${formatDateTime(user.adminGrant.expiresAt)}`
              : 'Active · no expiry'
            : user.adminGrant
              ? 'Revoked'
              : 'None'}
        </Pill>
      }
      hint="Independent of purchases. Revoking ends only this grant; paid subscriptions keep their access."
    >
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          void run(true);
        }}
      >
        <fieldset className="flex gap-4 text-sm">
          <legend className="sr-only">Action</legend>
          {(['grant', 'revoke'] as const).map((value) => (
            <label key={value} className="flex items-center gap-2">
              <input
                type="radio"
                name="premium-action"
                checked={action === value}
                onChange={() => edit(() => setAction(value))}
                className="size-4 accent-primary"
              />
              {value === 'grant' ? 'Grant or change expiry' : 'Revoke'}
            </label>
          ))}
        </fieldset>
        {action === 'grant' && (
          <fieldset className="space-y-2 text-sm">
            <legend className="mb-1 text-xs font-semibold text-muted-foreground">
              Access
            </legend>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="premium-expiry"
                checked={forever}
                onChange={() => edit(() => setForever(true))}
                className="size-4 accent-primary"
              />
              Until revoked
            </label>
            <label className="flex flex-wrap items-center gap-2">
              <input
                type="radio"
                name="premium-expiry"
                checked={!forever}
                onChange={() => edit(() => setForever(false))}
                className="size-4 accent-primary"
              />
              Until
              <input
                type="datetime-local"
                aria-label="Expiry, your local time"
                value={until}
                disabled={forever}
                onChange={(event) => edit(() => setUntil(event.target.value))}
                className="h-9 rounded-lg border border-input bg-background px-2 font-mono text-xs disabled:opacity-50"
              />
            </label>
          </fieldset>
        )}
        <div className="space-y-1">
          <label
            htmlFor={`reason-${user.userId}`}
            className="text-xs font-semibold text-muted-foreground"
          >
            Reason (stored in the audit; never secrets)
          </label>
          <textarea
            id={`reason-${user.userId}`}
            rows={2}
            maxLength={300}
            required
            value={reason}
            onChange={(event) => edit(() => setReason(event.target.value))}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Request <Mono>{requestId.slice(0, 8)}…</Mono> · the server records the
          actor
        </p>
        {error && <ActionError message={error} />}
        {preview && (
          <PremiumPreview result={preview} access={user.access.tier} />
        )}
        {applied && (
          <ResultNote>
            {applied.outcome === 'duplicate'
              ? 'Already applied earlier; the stored receipt was returned.'
              : `Applied (${applied.outcome}) as revision ${applied.aggregateRevision}. An outbox entry is pending if access changed.`}
          </ResultNote>
        )}
        <div className="flex flex-wrap gap-2">
          {preview ? (
            <Button
              type="button"
              size="lg"
              disabled={busy}
              onClick={() => void run(false)}
            >
              Apply {action}
            </Button>
          ) : (
            <Button
              type="submit"
              size="lg"
              variant="outline"
              disabled={busy || !reason.trim() || needsDate}
            >
              Preview
            </Button>
          )}
        </div>
      </form>
    </ActionCard>
  );
}

function PremiumPreview({
  result,
  access,
}: {
  result: AdminPremiumResult;
  access: 'free' | 'premium';
}) {
  return (
    <div className="space-y-2 rounded-lg bg-info/5 p-3 text-sm">
      <p className="font-medium text-info">Preview · nothing written yet</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted-foreground">Grant before</dt>
        <dd>{grantText(result.before)}</dd>
        <dt className="text-muted-foreground">Grant after</dt>
        <dd className="font-medium">{grantText(result.after)}</dd>
        <dt className="text-muted-foreground">Access now</dt>
        <dd>{access}</dd>
        <dt className="text-muted-foreground">Revision</dt>
        <dd>
          <Mono>{result.aggregateRevision}</Mono> after apply
        </dd>
        <dt className="text-muted-foreground">Actor</dt>
        <dd>
          <Mono>{result.actor}</Mono>
        </dd>
      </dl>
      <p className="text-xs text-muted-foreground">
        One transaction writes the grant, an audit receipt, the snapshot, and an
        outbox entry when access changes.
      </p>
    </div>
  );
}

function grantText(grant: AdminGrantView | null) {
  if (!grant) {
    return 'none';
  }

  if (grant.state === 'revoked') {
    return `revoked (rev ${grant.revision})`;
  }

  return grant.expiresAt
    ? `active until ${formatDateTime(grant.expiresAt)} (rev ${grant.revision})`
    : `active, no expiry (rev ${grant.revision})`;
}

/**
 * Queue jobs for the worker: a refresh per stored subscription, or an
 * expiration job. The run ID makes a retry produce the same event IDs.
 */
export function JobAction({
  title,
  hint,
  run,
  onChanged,
}: {
  title: string;
  hint: string;
  run: (input: { runId: string; dryRun: boolean }) => Promise<AdminRunResult>;
  onChanged: () => Promise<void>;
}) {
  const [runId, setRunId] = useState(() => crypto.randomUUID());
  const [result, setResult] = useState<AdminRunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const queueable =
    result?.dryRun && result.jobs.some((job) => job.status === 'would_queue');

  async function execute(dryRun: boolean) {
    setBusy(true);
    setError(null);
    try {
      const next = await run({ runId, dryRun });
      setResult(next);
      if (!dryRun) {
        setRunId(crypto.randomUUID());
        await onChanged();
      }
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ActionCard title={title} hint={hint}>
      {error && <ActionError message={error} />}
      {result && (
        <div className="space-y-2">
          <p
            className={
              result.dryRun
                ? 'text-sm font-medium text-info'
                : 'text-sm font-medium text-success'
            }
          >
            {result.dryRun
              ? 'Preview · nothing queued yet'
              : 'Queued. The worker commits within seconds; reload to see the markers.'}
          </p>
          {result.jobs.length ? (
            <ul className="space-y-1.5 text-xs">
              {result.jobs.map((job) => (
                <li
                  key={`${job.kind}-${job.reference}`}
                  className="rounded-md bg-background px-2 py-1.5"
                >
                  <span className="font-semibold">{job.kind}</span>{' '}
                  <Mono>{job.reference}</Mono>
                  <span className="block text-muted-foreground">
                    {job.status === 'skipped'
                      ? `skipped: ${job.reason}`
                      : `${job.status === 'queued' ? 'queued' : 'would queue'} ${job.eventId}`}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">
              No stored subscription to refresh.
            </p>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {queueable ? (
          <Button size="lg" disabled={busy} onClick={() => void execute(false)}>
            Queue jobs
          </Button>
        ) : (
          <Button
            size="lg"
            variant="outline"
            disabled={busy}
            onClick={() => void execute(true)}
          >
            Preview
          </Button>
        )}
      </div>
    </ActionCard>
  );
}

function ActionCard({
  title,
  status,
  hint,
  children,
}: {
  title: string;
  status?: ReactNode;
  hint: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        {status}
      </div>
      <p className="text-xs text-muted-foreground">{hint}</p>
      {children}
    </section>
  );
}

function ActionError({ message }: { message: string }) {
  return (
    <Alert variant="destructive">
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

function ResultNote({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg bg-success/10 p-3 text-sm text-success">
      {children}
    </p>
  );
}

function errorMessage(caught: unknown) {
  return caught instanceof AdminApiError
    ? caught.message
    : 'The request failed. Check the API log.';
}
