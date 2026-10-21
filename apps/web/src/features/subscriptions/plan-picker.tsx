import { ArrowRight, Check, LoaderCircle } from 'lucide-react';
import type { StripePlanId } from '@premiumpass/api-contracts';
import type { Checkout } from './use-checkout';
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
import { Alert, AlertDescription } from '../../components/ui/alert';

const plans: {
  id: StripePlanId;
  title: string;
  interval: string;
  description: string;
}[] = [
  {
    id: 'premium_monthly',
    title: 'Monthly',
    interval: 'Renews every month',
    description: 'The usual subscription rhythm.',
  },
  {
    id: 'premium_daily',
    title: 'Daily',
    interval: 'Renews every day',
    description: 'Watch renewals and expiry within a workshop day.',
  },
];

const premiumFeatures = [
  'Your full score history',
  'Premium on web, iOS, and Android',
  'Cancel anytime, keep access until the period ends',
];

/**
 * The Stripe purchase form. It stays visible for every Free user so an open
 * checkout attempt can be resumed; the API rejects a new purchase while a
 * subscription blocks it. The period is locked to a saved attempt because its
 * idempotency key already belongs to that plan.
 */
export function PlanPicker({
  checkout,
  userId,
}: {
  checkout: Checkout;
  userId: string | undefined;
}) {
  return (
    <Card className="gap-6 py-6 ring-primary/30" id="upgrade">
      <CardHeader className="px-6">
        <CardTitle className="text-lg font-semibold">
          Upgrade to Premium
        </CardTitle>
        <CardDescription>
          Both billing periods unlock the same Premium features and renew
          automatically until you cancel. You review the exact test price in
          Stripe Checkout.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 px-6">
        <fieldset
          disabled={checkout.pending || checkout.planLocked}
          className="grid gap-3 sm:grid-cols-2"
        >
          <legend className="sr-only">Billing period</legend>
          {plans.map((plan) => (
            <label
              key={plan.id}
              className="relative flex cursor-pointer flex-col gap-1 rounded-xl border bg-card p-4 transition-colors hover:border-primary/50 has-checked:border-primary has-checked:bg-primary/5 has-checked:ring-1 has-checked:ring-primary has-disabled:cursor-default has-disabled:opacity-70"
            >
              <span className="flex items-center justify-between gap-2">
                <span className="font-medium">{plan.title}</span>
                <input
                  type="radio"
                  name="stripe-plan"
                  value={plan.id}
                  checked={checkout.planId === plan.id}
                  onChange={() => checkout.selectPlan(plan.id)}
                  className="size-4 accent-primary"
                />
              </span>
              <span className="text-sm text-muted-foreground">
                {plan.interval}
              </span>
              <span className="text-xs text-muted-foreground">
                {plan.description}
              </span>
            </label>
          ))}
        </fieldset>
        {checkout.planLocked && !checkout.pending && (
          <p className="text-sm text-muted-foreground">
            Your open checkout keeps the{' '}
            {checkout.planId === 'premium_daily' ? 'daily' : 'monthly'} billing
            period. Resume it below; once it has expired or completed, you can
            start a new attempt.
          </p>
        )}
        <ul className="grid gap-2 text-sm">
          {premiumFeatures.map((feature) => (
            <li key={feature} className="flex items-center gap-2">
              <Check className="size-4 text-success" aria-hidden />
              {feature}
            </li>
          ))}
        </ul>
        {checkout.message && (
          <Alert role="status">
            <AlertDescription>{checkout.message}</AlertDescription>
          </Alert>
        )}
      </CardContent>
      <CardFooter className="flex-col items-stretch gap-3 px-6 sm:flex-row sm:items-center">
        <Button
          size="lg"
          className="h-10 px-4"
          disabled={!userId || checkout.pending}
          onClick={() => {
            void checkout.checkout();
          }}
        >
          {checkout.pending ? (
            <>
              <LoaderCircle className="animate-spin" aria-hidden />
              Preparing checkout…
            </>
          ) : (
            <>
              {checkout.planLocked ? 'Resume checkout' : 'Continue to checkout'}
              <ArrowRight />
            </>
          )}
        </Button>
        {checkout.canStartNewAttempt && (
          <Button
            variant="outline"
            size="lg"
            className="h-10 px-4"
            onClick={checkout.newAttempt}
          >
            Start a new attempt
          </Button>
        )}
        <p className="text-xs text-muted-foreground sm:ml-auto">
          <Badge variant="outline" className="mr-1.5">
            Stripe
          </Badge>
          Test card 4242 4242 4242 4242
        </p>
      </CardFooter>
    </Card>
  );
}
