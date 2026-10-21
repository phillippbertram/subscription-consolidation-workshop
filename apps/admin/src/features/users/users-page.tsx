import { useState } from 'react';
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
import { formatDateTime, shortId } from '@/lib/format';
import { AppLink, userPath } from '@/lib/navigation';
import { cn } from '@/lib/utils';
import { accessSummary, evaluationText } from './presentation';

type AccessFilter = 'all' | 'premium' | 'free';

export function UsersPage({ state }: { state: AdminState }) {
  const [query, setQuery] = useState('');
  const [access, setAccess] = useState<AccessFilter>('all');
  const [attentionOnly, setAttentionOnly] = useState(false);
  const attentionUsers = new Set(
    state.checks
      .filter((check) => check.severity !== 'ok')
      .flatMap((check) => check.userIds),
  );
  const users = state.users.filter(
    (user) =>
      (access === 'all' || user.access.tier === access) &&
      (!attentionOnly || attentionUsers.has(user.userId)) &&
      matches(user, query),
  );
  const subscriptions = users
    .flatMap((user) => user.subscriptions)
    .sort((a, b) => accessEnd(a).localeCompare(accessEnd(b)));

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Users and subscriptions
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Who has access right now, from which source, and whether the stored
          snapshot still matches. No email or name is stored: a user is the
          internal UUID plus the verified Auth0 issuer and subject.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4">
        <div className="flex min-w-64 flex-1 flex-col gap-1">
          <label
            htmlFor="search"
            className="text-xs font-semibold text-muted-foreground"
          >
            Find a user
          </label>
          <input
            id="search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Internal UUID, Auth0 subject, sub_…, cus_…, cs_test_…, Sandbox:…"
            className="h-10 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </div>
        <div
          role="group"
          aria-label="Access now"
          className="flex gap-1 rounded-lg bg-muted p-1"
        >
          {(['all', 'premium', 'free'] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={access === value}
              onClick={() => setAccess(value)}
              className={cn(
                'h-8 rounded-md px-3 text-sm font-medium text-muted-foreground',
                access === value && 'bg-card text-foreground shadow-sm',
              )}
            >
              {value === 'all'
                ? 'All'
                : value === 'premium'
                  ? 'Premium'
                  : 'Free'}
            </button>
          ))}
        </div>
        <label className="flex h-10 items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={attentionOnly}
            onChange={(event) => setAttentionOnly(event.target.checked)}
            className="size-4 accent-primary"
          />
          Needs attention only
        </label>
      </div>

      <Section
        title={`Users · ${users.length}`}
        hint="“Snapshot” compares the stored ENTITLEMENTS record with access computed now."
      >
        {users.length ? (
          <TableFrame>
            <thead>
              <tr>
                <Th>User</Th>
                <Th>Access now</Th>
                <Th>Sources</Th>
                <Th>Snapshot</Th>
                <Th>Last activity</Th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.userId}>
                  <Td>
                    <AppLink
                      to={userPath(user.userId)}
                      className="font-mono text-sm font-medium text-primary underline-offset-4 hover:underline"
                    >
                      {shortId(user.userId)}
                    </AppLink>
                    <Mono className="block text-muted-foreground">
                      {user.identity?.subject ?? 'identity map missing'}
                    </Mono>
                  </Td>
                  <Td>
                    <TierBadge tier={user.access.tier} />
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {accessSummary(user)}
                    </span>
                  </Td>
                  <Td>
                    <span className="flex flex-wrap gap-1.5">
                      {user.subscriptions.map((subscription) => (
                        <ProviderBadge
                          key={subscription.providerSubscriptionId}
                          provider={subscription.provider}
                          inactive={subscription.evaluation.result !== 'grants'}
                        />
                      ))}
                      {user.adminGrant?.state === 'active' && (
                        <ProviderBadge provider="admin" />
                      )}
                      {!user.subscriptions.length &&
                        user.adminGrant?.state !== 'active' && (
                          <span className="text-xs text-muted-foreground">
                            none
                          </span>
                        )}
                    </span>
                  </Td>
                  <Td>
                    <Mono>
                      {user.snapshot ? `rev ${user.snapshot.revision}` : '–'}
                    </Mono>
                    <span
                      className={cn(
                        'block text-xs font-medium',
                        user.drift ? 'text-warning' : 'text-success',
                      )}
                    >
                      {user.drift
                        ? 'Drift'
                        : user.snapshot
                          ? 'In sync'
                          : 'No snapshot yet'}
                    </span>
                  </Td>
                  <Td className="text-xs whitespace-nowrap">
                    {formatDateTime(user.lastActivityAt)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableFrame>
        ) : (
          <EmptyRow>
            No user matches. Profiles appear after the first sign-in on the
            website or app.
          </EmptyRow>
        )}
      </Section>

      <Section
        title={`All subscriptions · ${subscriptions.length}`}
        hint="Sorted by access end: what ends next is on top. Expired records stay stored; expiry is checked on every read."
      >
        {subscriptions.length ? (
          <TableFrame>
            <thead>
              <tr>
                <Th>Provider</Th>
                <Th>Reference</Th>
                <Th>State (provider)</Th>
                <Th>Access now</Th>
                <Th>Verified</Th>
                <Th>Owner</Th>
                <Th>User</Th>
              </tr>
            </thead>
            <tbody>
              {subscriptions.map((subscription) => (
                <tr
                  key={`${subscription.provider}#${subscription.providerSubscriptionId}`}
                >
                  <Td>
                    <ProviderBadge provider={subscription.provider} />
                  </Td>
                  <Td>
                    <Mono>{subscription.providerSubscriptionId}</Mono>
                    <span className="block text-xs text-muted-foreground">
                      {subscription.productId}
                    </span>
                  </Td>
                  <Td>
                    <span className="font-medium">{subscription.state}</span>
                    <span className="block text-xs text-muted-foreground">
                      {subscription.providerStatus}
                      {subscription.cancelAtPeriodEnd &&
                        ' · cancels at period end'}
                    </span>
                  </Td>
                  <Td className="text-xs">
                    {evaluationText(subscription.evaluation)}
                  </Td>
                  <Td className="text-xs whitespace-nowrap">
                    {formatDateTime(subscription.verifiedAt)}
                  </Td>
                  <Td>
                    <OwnerState subscription={subscription} />
                  </Td>
                  <Td>
                    <AppLink
                      to={userPath(subscription.userId)}
                      className="font-mono text-xs text-primary underline-offset-4 hover:underline"
                    >
                      {shortId(subscription.userId)}
                    </AppLink>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableFrame>
        ) : (
          <EmptyRow>No subscriptions stored yet.</EmptyRow>
        )}
      </Section>
    </>
  );
}

export function OwnerState({
  subscription,
}: {
  subscription: AdminUser['subscriptions'][number];
}) {
  if (subscription.ownerMismatch) {
    return (
      <Pill className="bg-destructive/10 text-destructive">Other user</Pill>
    );
  }

  if (subscription.ownerBound) {
    return <Pill className="bg-success/10 text-success">Bound</Pill>;
  }

  return (
    <Pill className="bg-muted text-muted-foreground">
      {subscription.demoScenario || subscription.provider === 'apple_mock'
        ? 'Demo record'
        : 'Not bound'}
    </Pill>
  );
}

function accessEnd(subscription: AdminUser['subscriptions'][number]) {
  return (
    subscription.graceUntil ??
    subscription.accessUntil ??
    '9999-12-31T00:00:00.000Z'
  );
}

/** Search the identifiers an operator might copy from another tool. */
function matches(user: AdminUser, query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return true;
  }

  return [
    user.userId,
    user.identity?.subject,
    ...user.providerLinks.map((link) => link.value),
    ...user.subscriptions.map((s) => s.providerSubscriptionId),
  ].some((value) => value?.toLowerCase().includes(needle));
}
