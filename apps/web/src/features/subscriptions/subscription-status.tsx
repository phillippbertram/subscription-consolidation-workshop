import { useState } from 'react';
import type { AccountState } from '../account/use-account';
import { CancelSubscription } from './cancel-subscription';
import { formatDate } from '../../lib/format-date';
import { SubscriptionDetails } from './subscription-details';
import { providerNames } from './subscription-presentation';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../../components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '../../components/ui/alert';

export function SubscriptionStatus({
  state,
  onRefresh,
}: {
  state: AccountState;
  onRefresh: () => void;
}) {
  const [notice, setNotice] = useState('');
  const [confirmedIds, setConfirmedIds] = useState<string[]>([]);

  function onCanceled(subscriptionId: string, status: 'scheduled' | 'ended') {
    if (status === 'scheduled') {
      setConfirmedIds((ids) => [...ids, subscriptionId]);
    }

    setNotice(
      status === 'scheduled'
        ? 'Cancellation scheduled. Auto-renewal is off. Your remaining access stays available; the subscription details will update shortly.'
        : 'This subscription has already ended. Refreshing your access status.',
    );
    onRefresh();
  }

  const needsAttention =
    state.status === 'success' &&
    (state.entitlements.warnings.length > 0 ||
      state.subscriptions.some((subscription) =>
        ['pending', 'past_due', 'paused'].includes(subscription.state),
      ));
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>Your Premium access</CardTitle>
          <Button
            variant="outline"
            onClick={onRefresh}
            disabled={state.status === 'loading'}
          >
            {state.status === 'loading' ? 'Refreshing…' : 'Refresh account'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4" aria-live="polite">
        {notice && <p className="text-sm text-muted-foreground">{notice}</p>}
        {state.status === 'loading' && (
          <p className="text-sm text-muted-foreground">
            Checking your subscription…
          </p>
        )}
        {state.status === 'error' && (
          <Alert variant="destructive">
            <AlertTitle>Account status unavailable</AlertTitle>
            <AlertDescription>
              {state.message} No current access status could be verified.
            </AlertDescription>
          </Alert>
        )}
        {state.status === 'success' && (
          <>
            <Badge
              variant={
                state.entitlements.tier === 'premium' ? 'default' : 'secondary'
              }
            >
              {state.entitlements.tier === 'premium' ? 'Premium' : 'Free'}
            </Badge>
            <p className="text-sm text-muted-foreground">
              {state.entitlements.tier === 'premium'
                ? 'Your Premium access includes score history.'
                : 'You are on the Free plan. Premium unlocks your score history.'}
            </p>
            {state.entitlements.grants.map((grant) => {
              if (grant.source === 'admin') {
                return (
                  <div
                    key={`admin:${grant.grantId}`}
                    className="border-t pt-3 text-sm"
                  >
                    <p className="font-medium">Complimentary Premium</p>
                    <p className="text-muted-foreground">
                      {grant.validUntil
                        ? `Access until ${formatDate(grant.validUntil)}`
                        : 'Access until revoked'}
                    </p>
                  </div>
                );
              }

              const subscription = state.subscriptions.find(
                (s) =>
                  s.provider === grant.provider &&
                  s.providerSubscriptionId === grant.providerSubscriptionId,
              );
              return (
                <div
                  key={`${grant.provider}:${grant.providerSubscriptionId}`}
                  className="flex flex-wrap items-start justify-between gap-2 border-t pt-3 text-sm"
                >
                  <span className="font-medium">
                    {providerNames[grant.provider]}
                  </span>
                  <div className="space-y-1 text-right text-muted-foreground">
                    <p>Access until {formatDate(grant.validUntil)}</p>
                    {subscription?.cancelAtPeriodEnd && (
                      <p>Ends after this period · Auto-renewal off</p>
                    )}
                    {subscription?.state === 'trialing' && <p>Trial</p>}
                    {subscription && !subscription.cancelAtPeriodEnd && (
                      <CancelSubscription
                        subscription={subscription}
                        confirmedIds={confirmedIds}
                        onCanceled={onCanceled}
                      />
                    )}
                  </div>
                </div>
              );
            })}
            {needsAttention && (
              <p className="text-sm text-muted-foreground">
                A subscription needs attention. Open details before making
                another purchase.
              </p>
            )}
          </>
        )}
        <SubscriptionDetails
          state={state}
          confirmedIds={confirmedIds}
          onCanceled={onCanceled}
          notice={notice}
        />
      </CardContent>
    </Card>
  );
}
