import { Dialog } from 'radix-ui';
import type { AccountState } from '../account/use-account';
import { formatDate } from '../../lib/format-date';
import { providerNames } from './subscription-presentation';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import {
  CancelSubscription,
  type CancellationActions,
} from './cancel-subscription';

export function SubscriptionDetails({
  state,
  confirmedIds,
  onCanceled,
  notice,
}: CancellationActions & { state: AccountState; notice: string }) {
  const records =
    state.status === 'success'
      ? state.subscriptions
          .map((subscription) => ({
            subscription,
            hasAccess: state.entitlements.grants.some(
              (grant) =>
                grant.source === 'provider' &&
                grant.provider === subscription.provider &&
                grant.providerSubscriptionId ===
                  subscription.providerSubscriptionId,
            ),
          }))
          .sort((a, b) => Number(b.hasAccess) - Number(a.hasAccess))
      : [];
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <Button variant="ghost" disabled={state.status !== 'success'}>
          Subscription details
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[85dvh] w-[calc(100%_-_2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border bg-card p-6 text-card-foreground shadow-xl">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
            <Dialog.Title className="text-xl font-semibold">
              Subscription details
            </Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="outline">Close</Button>
            </Dialog.Close>
          </div>
          <Dialog.Description className="mb-6 text-sm text-muted-foreground">
            Current and previous subscriptions, with their latest recorded
            status.
          </Dialog.Description>
          {notice && (
            <p className="mb-4 text-sm text-muted-foreground">{notice}</p>
          )}
          {state.status === 'loading' && (
            <p>Refreshing subscription details…</p>
          )}
          {state.status === 'error' && <p>{state.message}</p>}
          {state.status === 'success' && (
            <div className="space-y-5">
              <p className="text-sm text-muted-foreground">
                Checked {formatDate(state.entitlements.evaluatedAt)}
              </p>
              {state.subscriptions.length === 0 ? (
                <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  No subscriptions recorded yet.
                </p>
              ) : (
                <div className="grid gap-4">
                  {records.map(({ subscription, hasAccess }) => (
                    <article
                      key={`${subscription.provider}:${subscription.providerSubscriptionId}`}
                      className="min-w-0 space-y-3 rounded-lg border p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="font-medium">
                          {providerNames[subscription.provider]}
                        </h3>
                        <Badge variant="outline">
                          {hasAccess
                            ? 'Grants current access'
                            : 'No current access'}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Provider state:{' '}
                        {subscription.state.replaceAll('_', ' ')}
                      </p>
                      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
                        <dt className="text-muted-foreground">Product</dt>
                        <dd className="break-all">{subscription.productId}</dd>
                        <dt className="text-muted-foreground">
                          Provider status
                        </dt>
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
                            <dt className="text-muted-foreground">
                              Grace until
                            </dt>
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
                        <dt className="text-muted-foreground">
                          Subscription ID
                        </dt>
                        <dd className="break-all font-mono text-xs">
                          {subscription.providerSubscriptionId}
                        </dd>
                      </dl>
                      <CancelSubscription
                        subscription={subscription}
                        confirmedIds={confirmedIds}
                        onCanceled={onCanceled}
                      />
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
