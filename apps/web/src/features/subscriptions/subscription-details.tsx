import { ChevronDown, Globe, Smartphone } from 'lucide-react';
import type { AccountState } from '../account/use-account';
import { formatDate } from '../../lib/format-date';
import {
  describeSubscription,
  planName,
  providerNames,
} from './subscription-presentation';
import { Badge } from '../../components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../components/ui/card';
import { Skeleton } from '../../components/page-header';
import {
  CancelSubscription,
  type CancellationActions,
} from './cancel-subscription';

/** Every recorded subscription across stores, current access first. */
export function SubscriptionDetails({
  state,
  confirmedIds,
  onCanceled,
}: CancellationActions & { state: AccountState }) {
  const records =
    state.status === 'success'
      ? state.subscriptions
          .map((subscription) => ({
            subscription,
            ...describeSubscription(subscription, state.entitlements),
          }))
          .sort((a, b) => Number(b.hasAccess) - Number(a.hasAccess))
      : [];

  return (
    <Card className="gap-5 py-6">
      <CardHeader className="px-6">
        <CardTitle className="text-lg font-semibold">
          Subscription history
        </CardTitle>
        <CardDescription>
          Current and previous subscriptions from the website, App Store, and
          Google Play, with their latest verified status.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-6">
        {state.status === 'loading' && <Skeleton className="h-24 w-full" />}
        {state.status === 'error' && (
          <p className="text-sm text-muted-foreground">
            Subscription history is unavailable until your account loads.
          </p>
        )}
        {state.status === 'success' && records.length === 0 && (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            No subscriptions yet. Purchases from any store appear here once they
            are verified.
          </p>
        )}
        {records.length > 0 && (
          <ul className="divide-y rounded-lg border">
            {records.map(({ subscription, hasAccess, label, tone }) => {
              const Icon =
                subscription.provider === 'stripe' ? Globe : Smartphone;
              return (
                <li
                  key={`${subscription.provider}:${subscription.providerSubscriptionId}`}
                >
                  <details className="group">
                    <summary className="flex cursor-pointer list-none items-center gap-3 p-4 hover:bg-muted/40 [&::-webkit-details-marker]:hidden">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary">
                        <Icon
                          className="size-4 text-muted-foreground"
                          aria-hidden
                        />
                      </span>
                      <span className="min-w-0 flex-1 text-sm">
                        <span className="block font-medium">
                          {providerNames[subscription.provider]}
                          <span className="font-normal text-muted-foreground">
                            {' '}
                            · {planName(subscription.productId)}
                          </span>
                        </span>
                        <span className="block text-muted-foreground">
                          {subscription.accessUntil
                            ? `Until ${formatDate(subscription.accessUntil)}`
                            : 'No verified period'}
                        </span>
                      </span>
                      <Badge variant={tone}>{label}</Badge>
                      <ChevronDown
                        className="size-4 text-muted-foreground transition-transform group-open:rotate-180"
                        aria-hidden
                      />
                    </summary>
                    <div className="space-y-4 border-t bg-muted/30 p-4">
                      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-2 text-sm">
                        <dt className="text-muted-foreground">Access</dt>
                        <dd>
                          {hasAccess
                            ? 'Grants current access'
                            : 'No current access'}
                        </dd>
                        <dt className="text-muted-foreground">
                          Provider state
                        </dt>
                        <dd>{subscription.state.replaceAll('_', ' ')}</dd>
                        <dt className="text-muted-foreground">
                          Provider status
                        </dt>
                        <dd className="break-all">
                          {subscription.providerStatus}
                        </dd>
                        {subscription.graceUntil && (
                          <>
                            <dt className="text-muted-foreground">
                              Grace until
                            </dt>
                            <dd>{formatDate(subscription.graceUntil)}</dd>
                          </>
                        )}
                        <dt className="text-muted-foreground">Cancellation</dt>
                        <dd>
                          {subscription.cancelAtPeriodEnd ||
                          confirmedIds.includes(
                            subscription.providerSubscriptionId,
                          )
                            ? 'Scheduled at period end'
                            : 'None scheduled'}
                        </dd>
                        <dt className="text-muted-foreground">Last verified</dt>
                        <dd>{formatDate(subscription.verifiedAt)}</dd>
                        <dt className="text-muted-foreground">
                          Subscription ID
                        </dt>
                        <dd className="break-all font-mono text-xs">
                          {subscription.providerSubscriptionId}
                        </dd>
                      </dl>
                      {/* Access-granting subscriptions are canceled from the
                          current plan card; this covers e.g. unpaid records. */}
                      {!hasAccess && (
                        <CancelSubscription
                          subscription={subscription}
                          confirmedIds={confirmedIds}
                          onCanceled={onCanceled}
                        />
                      )}
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
