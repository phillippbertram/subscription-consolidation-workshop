import { ArrowRight, Gift, Globe, Smartphone, Sparkles } from 'lucide-react';
import type { Entitlements, Subscription } from '@premiumpass/api-contracts';
import type { AccountState } from '../account/use-account';
import {
  CancelSubscription,
  type CancellationActions,
} from './cancel-subscription';
import { formatDate } from '../../lib/format-date';
import { AppLink } from '../../lib/navigation';
import {
  describeMembership,
  findSubscription,
  planName,
  providerNames,
} from './subscription-presentation';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '../../components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '../../components/ui/alert';
import { Skeleton } from '../../components/page-header';

type Grant = Entitlements['grants'][number];

function accessHeadline(entitlements: Entitlements) {
  if (entitlements.tier === 'free') {
    return 'You are on the Free plan. Premium unlocks your score history on every device.';
  }

  return entitlements.effectiveUntil
    ? `Premium access until ${formatDate(entitlements.effectiveUntil)}.`
    : 'Premium access until revoked.';
}

/** The full current-plan card on the billing page, including every access source. */
export function SubscriptionStatus({
  state,
  notice,
  confirmedIds,
  onCanceled,
}: CancellationActions & { state: AccountState; notice: string }) {
  return (
    <Card className="gap-6 py-6" aria-live="polite">
      <CardHeader className="px-6">
        <CardDescription>Current plan</CardDescription>
        {state.status === 'success' ? (
          <div className="flex flex-wrap items-center gap-3">
            <CardTitle className="flex items-center gap-2 text-2xl font-semibold">
              {state.entitlements.tier === 'premium' && (
                <Sparkles className="size-5 text-primary" aria-hidden />
              )}
              {state.entitlements.tier === 'premium' ? 'Premium' : 'Free'}
            </CardTitle>
            <MembershipBadge state={state} confirmedIds={confirmedIds} />
          </div>
        ) : (
          <Skeleton className="h-8 w-40" />
        )}
      </CardHeader>
      <CardContent className="space-y-5 px-6">
        {notice && (
          <Alert>
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        )}
        {state.status === 'loading' && <Skeleton className="h-16 w-full" />}
        {state.status === 'error' && (
          <AccountUnavailable message={state.message} />
        )}
        {state.status === 'success' && (
          <>
            <p className="text-muted-foreground">
              {accessHeadline(state.entitlements)}
            </p>
            {describeMembership(state).needsAttention && (
              <Alert className="border-warning/30 bg-warning/5">
                <AlertTitle>A subscription needs attention</AlertTitle>
                <AlertDescription>
                  Check the subscription history below before making another
                  purchase. Stripe may still be waiting for a payment.
                </AlertDescription>
              </Alert>
            )}
            {state.entitlements.grants.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-medium">Your access comes from</h3>
                <ul className="divide-y rounded-lg border">
                  {state.entitlements.grants.map((grant) => (
                    <AccessSource
                      key={
                        grant.source === 'admin'
                          ? `admin:${grant.grantId}`
                          : `${grant.provider}:${grant.providerSubscriptionId}`
                      }
                      grant={grant}
                      subscription={findSubscription(
                        grant,
                        state.subscriptions,
                      )}
                      confirmedIds={confirmedIds}
                      onCanceled={onCanceled}
                    />
                  ))}
                </ul>
                {state.entitlements.grants.length > 1 && (
                  <p className="text-xs text-muted-foreground">
                    Premium stays active while at least one source is valid.
                    Ending one never removes another.
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** The compact membership card on the overview page. */
export function MembershipSummary({ state }: { state: AccountState }) {
  return (
    <Card className="gap-5 py-6">
      <CardHeader className="px-6">
        <CardDescription>Membership</CardDescription>
        {state.status === 'success' ? (
          <div className="flex flex-wrap items-center gap-3">
            <CardTitle className="flex items-center gap-2 text-xl font-semibold">
              {state.entitlements.tier === 'premium' && (
                <Sparkles className="size-4 text-primary" aria-hidden />
              )}
              {state.entitlements.tier === 'premium' ? 'Premium' : 'Free'}
            </CardTitle>
            <MembershipBadge state={state} confirmedIds={[]} />
          </div>
        ) : (
          <Skeleton className="h-7 w-32" />
        )}
      </CardHeader>
      <CardContent className="space-y-3 px-6 text-sm">
        {state.status === 'loading' && <Skeleton className="h-10 w-full" />}
        {state.status === 'error' && (
          <AccountUnavailable message={state.message} />
        )}
        {state.status === 'success' && (
          <>
            <p className="text-muted-foreground">
              {accessHeadline(state.entitlements)}
            </p>
            {state.entitlements.grants.map((grant) => {
              const subscription = findSubscription(grant, state.subscriptions);
              return (
                <p
                  key={
                    grant.source === 'admin'
                      ? `admin:${grant.grantId}`
                      : `${grant.provider}:${grant.providerSubscriptionId}`
                  }
                  className="flex items-center gap-2 font-medium"
                >
                  <SourceIcon grant={grant} />
                  {grant.source === 'admin'
                    ? 'Complimentary Premium'
                    : `${providerNames[grant.provider]}${subscription ? ` · ${planName(subscription.productId)}` : ''}`}
                </p>
              );
            })}
          </>
        )}
      </CardContent>
      {/* A card with a footer drops its own bottom padding (see Card), so the
          footer supplies it; without it the button is clipped at the edge. */}
      <CardFooter className="mt-auto border-t-0 bg-transparent px-6 pb-6">
        <Button
          asChild
          variant={
            state.status === 'success' && state.entitlements.tier === 'free'
              ? 'default'
              : 'outline'
          }
          className="w-full"
        >
          <AppLink to="/billing">
            {state.status === 'success' && state.entitlements.tier === 'free'
              ? 'Upgrade to Premium'
              : 'Manage billing'}
            <ArrowRight />
          </AppLink>
        </Button>
      </CardFooter>
    </Card>
  );
}

function MembershipBadge({
  state,
  confirmedIds,
}: {
  state: Extract<AccountState, { status: 'success' }>;
  confirmedIds: string[];
}) {
  const membership = describeMembership(state, confirmedIds);
  return <Badge variant={membership.tone}>{membership.label}</Badge>;
}

function AccountUnavailable({ message }: { message: string }) {
  return (
    <Alert variant="destructive">
      <AlertTitle>Account status unavailable</AlertTitle>
      <AlertDescription>
        {message} No current access status could be verified.
      </AlertDescription>
    </Alert>
  );
}

function SourceIcon({ grant }: { grant: Grant }) {
  const Icon =
    grant.source === 'admin'
      ? Gift
      : grant.provider === 'stripe'
        ? Globe
        : Smartphone;
  return <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />;
}

function AccessSource({
  grant,
  subscription,
  confirmedIds,
  onCanceled,
}: CancellationActions & {
  grant: Grant;
  subscription: Subscription | undefined;
}) {
  const cancellationScheduled =
    subscription !== undefined &&
    (subscription.cancelAtPeriodEnd ||
      confirmedIds.includes(subscription.providerSubscriptionId));
  // Same wording as the mobile app: only a paid, renewing state reads "on".
  const renewal = !subscription
    ? null
    : cancellationScheduled
      ? 'Auto-renewal off · Ends after this period'
      : subscription.state === 'past_due'
        ? 'Payment issue · Access remains available for now'
        : ['active', 'trialing'].includes(subscription.state)
          ? 'Auto-renewal on'
          : null;

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 p-4">
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary">
          <SourceIcon grant={grant} />
        </span>
        <div className="min-w-0 space-y-0.5 text-sm">
          <p className="font-medium">
            {grant.source === 'admin'
              ? 'Complimentary Premium'
              : providerNames[grant.provider]}
            {subscription && (
              <span className="font-normal text-muted-foreground">
                {' '}
                · {planName(subscription.productId)}
              </span>
            )}
          </p>
          <p className="text-muted-foreground">
            {grant.validUntil
              ? `Access until ${formatDate(grant.validUntil)}`
              : 'Access until revoked'}
            {grant.source === 'admin' && ' · Granted by an administrator'}
            {subscription?.state === 'trialing' && ' · Trial'}
          </p>
          {renewal && <p className="text-muted-foreground">{renewal}</p>}
        </div>
      </div>
      {subscription && !cancellationScheduled && (
        <CancelSubscription
          subscription={subscription}
          confirmedIds={confirmedIds}
          onCanceled={onCanceled}
        />
      )}
    </li>
  );
}
