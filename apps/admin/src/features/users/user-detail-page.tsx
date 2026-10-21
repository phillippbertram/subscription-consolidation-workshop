import type { AdminState, AdminUser } from '@premiumpass/api-contracts/admin';
import {
  EmptyRow,
  Mono,
  Pill,
  ProviderBadge,
  Section,
  TableFrame,
  Td,
  Th,
  TierBadge,
} from '@/components/status';
import type { AdminClient } from '@/api/admin-client';
import { formatDateTime } from '@/lib/format';
import { AppLink } from '@/lib/navigation';
import { cn } from '@/lib/utils';
import { activityFeed } from '../activity';
import { JobAction, PremiumAction } from './actions';
import { accessSummary, evaluationText } from './presentation';
import { LinkedIds } from './linked-ids';
import { OwnerState } from './users-page';

export function UserDetailPage({
  state,
  userId,
  client,
  onChanged,
}: {
  state: AdminState;
  userId: string;
  client: AdminClient;
  onChanged: () => Promise<void>;
}) {
  const user = state.users.find((candidate) => candidate.userId === userId);
  if (!user) {
    return (
      <Section title="User not found">
        <EmptyRow>
          No profile with this ID in {state.table}.{' '}
          <AppLink to="/users" className="text-primary underline">
            Back to users
          </AppLink>
        </EmptyRow>
      </Section>
    );
  }

  return (
    <>
      <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
        <AppLink to="/users" className="text-primary hover:underline">
          Users
        </AppLink>{' '}
        / <Mono>{user.userId}</Mono>
      </nav>

      <section className="flex flex-wrap items-center justify-between gap-6 rounded-xl border bg-card px-6 py-5">
        <div className="min-w-0 space-y-1.5">
          <h1 className="font-mono text-lg font-medium break-all">
            {user.userId}
          </h1>
          <p className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
            <span>
              Auth0 subject{' '}
              <Mono className="text-foreground">
                {user.identity?.subject ?? 'missing identity map'}
              </Mono>
            </span>
            <span>
              Issuer{' '}
              <Mono className="text-foreground">
                {user.identity?.issuer ?? '–'}
              </Mono>
            </span>
            <span>Profile created {formatDateTime(user.createdAt)}</span>
          </p>
        </div>
        <div
          className={cn(
            'flex items-center gap-3 rounded-lg px-4 py-3',
            user.access.tier === 'premium' ? 'bg-secondary' : 'bg-muted',
          )}
        >
          <span className="text-xl font-semibold">
            {user.access.tier === 'premium' ? 'Premium' : 'Free'}
          </span>
          <span className="max-w-64 text-sm text-muted-foreground">
            {accessSummary(user)}
          </span>
        </div>
      </section>

      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[999_1_640px] flex-col gap-6">
          <AccessExplanation user={user} readAt={state.readAt} />
          <LinkedIds user={user} />
          <Timeline state={state} user={user} />
          <AuditHistory user={user} />
          <Checkouts user={user} />
        </div>

        <aside className="flex min-w-0 flex-[1_1_320px] flex-col gap-4">
          <h2 className="text-base font-semibold">Actions</h2>
          <p className="-mt-2 text-xs text-muted-foreground">
            Every write shows a preview first and goes through the same
            transaction as the worker and the CLI.
          </p>
          <PremiumAction
            key={`premium-${user.userId}`}
            user={user}
            client={client}
            onChanged={onChanged}
          />
          <JobAction
            key={`refresh-${user.userId}`}
            title="Refresh from providers"
            hint="Queues one reconciliation job per stored subscription. The worker reads the current provider state and commits only real changes."
            run={(input) => client.refresh(user.userId, input)}
            onChanged={onChanged}
          />
          <JobAction
            key={`expiration-${user.userId}`}
            title="Expiration check"
            hint={
              user.drift
                ? 'The stored snapshot is out of date. A job recomputes it and announces the change; the API already answers correctly.'
                : 'Queues a job only when a stored access boundary has passed. Not needed while the snapshot is in sync.'
            }
            run={(input) => client.expiration(user.userId, input)}
            onChanged={onChanged}
          />
          <p className="rounded-xl border border-dashed p-4 text-xs text-muted-foreground">
            Demo overrides (<Mono>seed</Mono>, <Mono>set</Mono>) and direct
            Stripe repair stay in the CLI: <Mono>pnpm cli {user.userId}</Mono>.
            Raw items: DynamoDB Admin at{' '}
            <a
              href="http://127.0.0.1:8001"
              target="_blank"
              rel="noreferrer"
              className="text-primary underline"
            >
              127.0.0.1:8001
            </a>{' '}
            (edits there bypass every guarantee).
          </p>
        </aside>
      </div>
    </>
  );
}

/** Mirror deriveEntitlements: each source, then the union of valid grants. */
function AccessExplanation({
  user,
  readAt,
}: {
  user: AdminUser;
  readAt: string;
}) {
  const grant = user.adminGrant;
  const grantCounts = user.access.grants.some((g) => g.source === 'admin');

  return (
    <Section
      title={`Why this user is ${user.access.tier === 'premium' ? 'Premium' : 'Free'}`}
      hint={`The same steps as deriveEntitlements(subscriptions, now, adminGrant), at ${formatDateTime(readAt)}.`}
    >
      <ol>
        {user.subscriptions.map((subscription) => (
          <li
            key={`${subscription.provider}#${subscription.providerSubscriptionId}`}
            className="flex flex-wrap items-start gap-3 border-t border-muted px-5 py-3 first:border-t-0"
          >
            <ProviderBadge provider={subscription.provider} />
            <div className="min-w-0 flex-1 basis-72 space-y-0.5">
              <p className="flex flex-wrap items-center gap-2">
                <Mono className="text-sm">
                  {subscription.providerSubscriptionId}
                </Mono>
                <Pill
                  className={
                    subscription.evaluation.result === 'grants'
                      ? 'bg-success/10 text-success'
                      : subscription.evaluation.result === 'warning'
                        ? 'bg-warning/10 text-warning'
                        : 'bg-muted text-muted-foreground'
                  }
                >
                  {evaluationText(subscription.evaluation)}
                </Pill>
              </p>
              <p className="text-xs text-muted-foreground">
                {subscription.productId} · state {subscription.state} (provider{' '}
                {subscription.providerStatus})
                {subscription.cancelAtPeriodEnd && ' · cancels at period end'} ·
                accessUntil {formatDateTime(subscription.accessUntil)}
                {subscription.graceUntil &&
                  ` · graceUntil ${formatDateTime(subscription.graceUntil)}`}{' '}
                · verified {formatDateTime(subscription.verifiedAt)} · source
                rev {subscription.revision}
              </p>
            </div>
            <OwnerState subscription={subscription} />
          </li>
        ))}
        <li className="flex flex-wrap items-start gap-3 border-t border-muted px-5 py-3 first:border-t-0">
          <ProviderBadge provider="admin" />
          <div className="min-w-0 flex-1 basis-72 space-y-0.5">
            <p className="flex flex-wrap items-center gap-2">
              <Mono className="text-sm">ADMIN_GRANT#premium</Mono>
              <Pill
                className={
                  grantCounts
                    ? 'bg-success/10 text-success'
                    : 'bg-muted text-muted-foreground'
                }
              >
                {grantCounts
                  ? grant?.expiresAt
                    ? `Counts until ${formatDateTime(grant.expiresAt)}`
                    : 'Counts, no end'
                  : 'Grants nothing'}
              </Pill>
            </p>
            <p className="text-xs text-muted-foreground">
              {grant
                ? `${grant.state} · rev ${grant.revision} · updated ${formatDateTime(grant.updatedAt)}`
                : 'No complimentary grant. Reconciliation never creates or changes one.'}
            </p>
          </div>
        </li>
      </ol>
      <div className="flex flex-wrap items-center gap-4 border-t bg-background px-5 py-4 text-sm">
        <div className="min-w-56 flex-1">
          <p className="text-xs font-semibold text-muted-foreground">
            Computed now
          </p>
          <p className="font-medium">
            <TierBadge tier={user.access.tier} /> effectiveUntil{' '}
            {formatDateTime(user.access.effectiveUntil)}
          </p>
          <p className="text-xs text-muted-foreground">
            {user.access.grants.length} valid grant(s). effectiveUntil is the
            earliest end of any grant: the next moment to re-evaluate.
          </p>
        </div>
        <div className="min-w-56 flex-1">
          <p className="text-xs font-semibold text-muted-foreground">
            Stored snapshot (ENTITLEMENTS)
          </p>
          {user.snapshot ? (
            <>
              <p className="font-medium">
                <TierBadge tier={user.snapshot.tier} /> effectiveUntil{' '}
                {formatDateTime(user.snapshot.effectiveUntil)}
              </p>
              <p className="text-xs text-muted-foreground">
                rev {user.snapshot.revision} · evaluated{' '}
                {formatDateTime(user.snapshot.evaluatedAt)}
              </p>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              No commit for this user yet.
            </p>
          )}
        </div>
        <Pill
          className={
            user.drift
              ? 'bg-warning/10 text-warning'
              : 'bg-success/10 text-success'
          }
        >
          {user.drift ? 'Drift' : 'In sync'}
        </Pill>
      </div>
    </Section>
  );
}

function Timeline({ state, user }: { state: AdminState; user: AdminUser }) {
  const items = activityFeed(state, user.userId);

  return (
    <Section
      title="Timeline"
      hint="Processed jobs, admin changes, and checkouts for this user. A job without an outbox entry verified something without changing access."
    >
      {items.length ? (
        <ol className="px-5 py-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex gap-3 border-b border-muted py-3 last:border-b-0"
            >
              <span
                aria-hidden
                className={cn(
                  'mt-1.5 size-2.5 shrink-0 rounded-full',
                  item.outbox ? 'bg-primary' : 'border-2 border-input',
                )}
              />
              <div className="min-w-0 flex-1 space-y-1">
                <p className="flex flex-wrap items-center gap-2">
                  <ProviderBadge provider={item.provider} />
                  <span className="font-medium">{item.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(item.at)}
                  </span>
                </p>
                {item.detail && (
                  <p className="text-sm text-muted-foreground">{item.detail}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  {item.kind}
                  {item.provider !== 'outbox' && ' · '}
                  {item.provider !== 'outbox' &&
                    (item.outbox ? (
                      <>
                        announced as <Mono>rev {item.outbox.revision}</Mono>{' '}
                        <span
                          className={
                            item.outbox.status === 'sent'
                              ? 'text-success'
                              : 'text-warning'
                          }
                        >
                          ({item.outbox.status})
                        </span>
                      </>
                    ) : (
                      'no outbox entry'
                    ))}
                </p>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <EmptyRow>Nothing recorded for this user yet.</EmptyRow>
      )}
    </Section>
  );
}

function AuditHistory({ user }: { user: AdminUser }) {
  return (
    <Section
      title="Complimentary Premium audit"
      hint="Append-only receipts. A replayed request ID writes nothing; the actor comes from the server."
    >
      {user.audit.length ? (
        <TableFrame>
          <thead>
            <tr>
              <Th>At</Th>
              <Th>Action</Th>
              <Th>Outcome</Th>
              <Th>Actor</Th>
              <Th>Reason · expiry · request</Th>
            </tr>
          </thead>
          <tbody>
            {user.audit.map((entry) => (
              <tr key={entry.requestId}>
                <Td className="text-xs whitespace-nowrap">
                  {formatDateTime(entry.at)}
                </Td>
                <Td>{entry.action}</Td>
                <Td
                  className={
                    entry.outcome === 'changed'
                      ? 'text-success'
                      : 'text-muted-foreground'
                  }
                >
                  {entry.outcome}
                </Td>
                <Td>
                  <Mono>{entry.actor}</Mono>
                </Td>
                <Td>
                  {entry.reason}
                  <span className="block text-xs text-muted-foreground">
                    {entry.expiresAt
                      ? `until ${formatDateTime(entry.expiresAt)}`
                      : 'no expiry'}{' '}
                    · <Mono>{entry.requestId.slice(0, 8)}…</Mono> · rev{' '}
                    {entry.aggregateRevision}
                  </span>
                </Td>
              </tr>
            ))}
          </tbody>
        </TableFrame>
      ) : (
        <EmptyRow>No complimentary Premium changes.</EmptyRow>
      )}
    </Section>
  );
}

function Checkouts({ user }: { user: AdminUser }) {
  return (
    <Section
      title="Stripe checkouts"
      hint="A checkout request is never proof of payment; only the worker's verified subscription grants access."
    >
      {user.checkouts.length ? (
        <ul className="space-y-1 px-5 py-4 text-xs text-muted-foreground">
          {user.checkouts.map((checkout) => (
            <li key={checkout.requestId}>
              {formatDateTime(checkout.createdAt)} · {checkout.planId} ·{' '}
              {checkout.sessionId ? (
                <Mono>{checkout.sessionId}</Mono>
              ) : (
                'no session yet'
              )}{' '}
              · expires {formatDateTime(checkout.expiresAt)}
              {checkout.active && ' · active pointer'}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyRow>No checkout started.</EmptyRow>
      )}
    </Section>
  );
}
