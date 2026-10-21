import { useState } from 'react';
import { CircleCheck, Info, ShieldCheck, Smartphone, Zap } from 'lucide-react';
import type { AccountState } from '../account/use-account';
import { RefreshAccountButton } from '../account/refresh-account-button';
import type { Checkout } from './use-checkout';
import { PlanPicker } from './plan-picker';
import { SubscriptionDetails } from './subscription-details';
import { SubscriptionStatus } from './subscription-status';
import { PageHeader } from '../../components/page-header';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../../components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '../../components/ui/alert';

/** `?checkout=` is navigation only; it never says whether a payment succeeded. */
function readCheckoutReturn() {
  const result = new URLSearchParams(window.location.search).get('checkout');
  if (result === 'success') {
    return {
      title: 'Welcome back from Stripe',
      message:
        'We are confirming your payment with Stripe. Premium appears here once the backend has verified it, usually within seconds. Returning to this page alone does not activate Premium.',
    };
  }

  if (result === 'cancel') {
    return {
      title: 'Checkout not completed',
      message:
        'Your checkout is still open. Resume the same attempt below whenever you are ready.',
    };
  }

  return null;
}

export function BillingPage({
  state,
  onRefresh,
  checkout,
  userId,
}: {
  state: AccountState;
  onRefresh: () => void;
  checkout: Checkout;
  userId: string | undefined;
}) {
  const checkoutReturn = readCheckoutReturn();
  const [notice, setNotice] = useState('');
  const [confirmedIds, setConfirmedIds] = useState<string[]>([]);
  // Free users always see the offer so an open checkout attempt can be resumed.
  const showOffer =
    state.status === 'success' && state.entitlements.tier === 'free';

  function onCanceled(subscriptionId: string, status: 'scheduled' | 'ended') {
    if (status === 'scheduled') {
      setConfirmedIds((ids) => [...ids, subscriptionId]);
    }

    setNotice(
      status === 'scheduled'
        ? 'Cancellation scheduled. Auto-renewal is off and your remaining access stays available. Subscription details update shortly.'
        : 'This subscription has already ended. Refreshing your access status.',
    );
    onRefresh();
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Billing"
        description="Your plan, your access, and every subscription on your account."
        actions={<RefreshAccountButton state={state} onRefresh={onRefresh} />}
      />
      {checkoutReturn && (
        <Alert className="border-primary/20 bg-primary/5">
          <Info aria-hidden />
          <AlertTitle>{checkoutReturn.title}</AlertTitle>
          <AlertDescription>{checkoutReturn.message}</AlertDescription>
        </Alert>
      )}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-6">
          <SubscriptionStatus
            state={state}
            notice={notice}
            confirmedIds={confirmedIds}
            onCanceled={onCanceled}
          />
          {showOffer && <PlanPicker checkout={checkout} userId={userId} />}
          <SubscriptionDetails
            state={state}
            confirmedIds={confirmedIds}
            onCanceled={onCanceled}
          />
        </div>
        <BillingHelp />
      </div>
    </div>
  );
}

const helpItems = [
  {
    icon: ShieldCheck,
    title: 'Verified, not assumed',
    text: 'Premium starts when the backend has verified the payment with Stripe, never because a success page opened.',
  },
  {
    icon: Smartphone,
    title: 'Bought on your phone?',
    text: 'App Store and Google Play subscriptions show up here too. Manage them in the store where you bought them.',
  },
  {
    icon: CircleCheck,
    title: 'Cancel anytime',
    text: 'Cancelling turns off auto-renewal. You keep Premium until the period you paid for ends.',
  },
  {
    icon: Zap,
    title: 'Test mode only',
    text: 'No real money is charged. Use a Stripe test card and synthetic details.',
  },
];

function BillingHelp() {
  return (
    <Card className="gap-4 bg-muted/40 py-6 lg:sticky lg:top-24">
      <CardHeader className="px-6">
        <CardTitle className="font-semibold">How billing works</CardTitle>
      </CardHeader>
      <CardContent className="px-6">
        <ul className="space-y-4">
          {helpItems.map((item) => (
            <li key={item.title} className="flex gap-3 text-sm">
              <item.icon
                className="mt-0.5 size-4 shrink-0 text-primary"
                aria-hidden
              />
              <span>
                <span className="block font-medium">{item.title}</span>
                <span className="text-muted-foreground">{item.text}</span>
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
