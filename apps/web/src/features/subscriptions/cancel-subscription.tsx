import { useEffect, useRef, useState } from 'react';
import { Dialog } from 'radix-ui';
import type { Subscription } from '@premiumpass/api-contracts';
import { WebApiError } from '../../api/api-client';
import { useApiClient } from '../../api/use-api-client';
import { Button } from '../../components/ui/button';

export interface CancellationActions {
  confirmedIds: string[];
  onCanceled: (subscriptionId: string, status: 'scheduled' | 'ended') => void;
}

export function CancelSubscription({
  subscription,
  confirmedIds,
  onCanceled,
}: CancellationActions & {
  subscription: Subscription;
}) {
  const api = useApiClient();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  if (
    subscription.provider !== 'stripe' ||
    !['active', 'trialing', 'past_due', 'unpaid'].includes(
      subscription.providerStatus,
    )
  ) {
    return null;
  }

  if (
    subscription.cancelAtPeriodEnd ||
    confirmedIds.includes(subscription.providerSubscriptionId)
  ) {
    return (
      <p className="text-sm text-muted-foreground">
        Cancellation scheduled · Auto-renewal off
      </p>
    );
  }

  async function cancel() {
    if (inFlight.current) {
      return;
    }

    inFlight.current = true;
    setPending(true);
    setError('');
    try {
      const result = await api.cancelSubscription(
        subscription.providerSubscriptionId,
      );
      if (mounted.current) {
        setOpen(false);
        onCanceled(subscription.providerSubscriptionId, result.status);
      }
    } catch (failure) {
      if (mounted.current) {
        setError(
          failure instanceof WebApiError
            ? failure.message
            : 'Unable to confirm cancellation. Retry to check the outcome.',
        );
      }
    } finally {
      inFlight.current = false;
      if (mounted.current) {
        setPending(false);
      }
    }
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        if (!pending) {
          setOpen(value);
        }
      }}
    >
      <Dialog.Trigger asChild>
        <Button variant="outline">Cancel subscription</Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[70] w-[calc(100%_-_2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 space-y-5 rounded-xl border bg-card p-6 text-card-foreground shadow-xl">
          <Dialog.Title className="text-xl font-semibold">
            Cancel your website subscription?
          </Dialog.Title>
          <Dialog.Description className="text-sm text-muted-foreground">
            This stops automatic renewal after the current billing period. Your
            remaining paid access stays available until it expires. Other
            subscriptions are unaffected.
          </Dialog.Description>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex flex-wrap justify-end gap-3">
            <Dialog.Close asChild>
              <Button variant="outline" disabled={pending}>
                Keep subscription
              </Button>
            </Dialog.Close>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => {
                void cancel();
              }}
            >
              {pending ? 'Canceling…' : 'Confirm cancellation'}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
