import type { AccountState } from '../hooks/use-account';
import { formatDate } from './account-details';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from './ui/card';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';

const providerNames = {
  stripe: 'Stripe',
  apple: 'Apple Sandbox',
  apple_mock: 'Apple mock',
  google_mock: 'Google mock',
};
export function SubscriptionStatus({
  state,
  onRefresh,
}: {
  state: AccountState;
  onRefresh: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>Your subscription status</CardTitle>
          <Button
            variant="outline"
            onClick={onRefresh}
            disabled={state.status === 'loading'}
          >
            {state.status === 'loading' ? 'Refreshing…' : 'Refresh account'}
          </Button>
        </div>
        <CardDescription>
          Subscriptions and access verified by the backend. Webhook processing
          can take a moment after checkout.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6" aria-live="polite">
        {state.status === 'loading' && (
          <p className="text-sm text-muted-foreground">
            Loading profile, subscriptions, and access…
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
            <div className="space-y-2">
              <Badge
                variant={
                  state.entitlements.tier === 'premium'
                    ? 'default'
                    : 'secondary'
                }
              >
                {state.entitlements.tier === 'premium'
                  ? 'Premium access'
                  : 'Free access'}
              </Badge>
              <p className="text-sm">
                {state.entitlements.tier === 'premium'
                  ? 'Score history is available with your verified access.'
                  : 'There is currently no valid Premium grant for this account.'}
              </p>
              <p className="text-xs text-muted-foreground">
                Checked {formatDate(state.entitlements.evaluatedAt)}
              </p>
              {state.entitlements.effectiveUntil && (
                <p className="text-xs text-muted-foreground">
                  Next access recheck:{' '}
                  {formatDate(state.entitlements.effectiveUntil)}
                </p>
              )}
            </div>
            {state.subscriptions.length === 0 ? (
              <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                No subscriptions recorded yet. After a test purchase, wait for
                the webhook and worker, then refresh your account.
              </p>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {state.subscriptions.map((subscription) => (
                  <article
                    key={`${subscription.provider}:${subscription.providerSubscriptionId}`}
                    className="min-w-0 space-y-3 rounded-lg border p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-medium">
                        {providerNames[subscription.provider]}
                      </h3>
                      <Badge variant="outline">
                        {subscription.state.replaceAll('_', ' ')}
                      </Badge>
                    </div>
                    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
                      <dt className="text-muted-foreground">Product</dt>
                      <dd className="break-all">{subscription.productId}</dd>
                      <dt className="text-muted-foreground">Provider status</dt>
                      <dd className="break-all">
                        {subscription.providerStatus}
                      </dd>
                      <dt className="text-muted-foreground">Access until</dt>
                      <dd>
                        {subscription.accessUntil
                          ? formatDate(subscription.accessUntil)
                          : 'No verified period'}
                      </dd>
                      {subscription.graceUntil && (
                        <>
                          <dt className="text-muted-foreground">Grace until</dt>
                          <dd>{formatDate(subscription.graceUntil)}</dd>
                        </>
                      )}
                      <dt className="text-muted-foreground">Cancellation</dt>
                      <dd>
                        {subscription.cancelAtPeriodEnd
                          ? 'Scheduled at period end'
                          : 'None scheduled'}
                      </dd>
                      <dt className="text-muted-foreground">Last verified</dt>
                      <dd>{formatDate(subscription.verifiedAt)}</dd>
                      <dt className="text-muted-foreground">Subscription ID</dt>
                      <dd className="break-all font-mono text-xs">
                        {subscription.providerSubscriptionId}
                      </dd>
                    </dl>
                  </article>
                ))}
              </div>
            )}
            {state.entitlements.warnings.length > 0 && (
              <Alert>
                <AlertTitle>Some subscriptions do not grant access</AlertTitle>
                <AlertDescription>
                  Unknown products or inconsistent provider states were reported
                  by the backend. Inspect the subscription records before
                  retrying a purchase.
                </AlertDescription>
              </Alert>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
