import { Laptop, Smartphone } from 'lucide-react';
import type { AccountState } from '../account/use-account';
import { displayName, type SessionProfile } from '../account/account-details';
import { RefreshAccountButton } from '../account/refresh-account-button';
import { ScoreHistoryCard } from '../scores/score-history-card';
import { MembershipSummary } from '../subscriptions/subscription-status';
import { PageHeader } from '../../components/page-header';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../../components/ui/card';

export function OverviewPage({
  identity,
  state,
  onRefresh,
}: {
  identity: SessionProfile;
  state: AccountState;
  onRefresh: () => void;
}) {
  const name = displayName(identity);
  // Unknown while loading or after an error: show neither data nor a paywall.
  const hasAccess =
    state.status === 'success'
      ? state.entitlements.features.includes('score_history')
      : null;

  return (
    <div className="space-y-8">
      <PageHeader
        title={name ? `Welcome back, ${name}` : 'Welcome back'}
        description="Your score and membership at a glance."
        actions={<RefreshAccountButton state={state} onRefresh={onRefresh} />}
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ScoreHistoryCard hasAccess={hasAccess} />
        </div>
        <div className="flex flex-col gap-6">
          <MembershipSummary state={state} />
          <Card className="gap-4 py-6">
            <CardHeader className="px-6">
              <CardTitle className="font-semibold">
                Take PremiumPass with you
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 px-6 text-sm text-muted-foreground">
              <p>
                Sign in to the iOS or Android app with this account. Your
                membership is already there, wherever you bought it.
              </p>
              <div className="flex gap-2">
                {[
                  { icon: Laptop, label: 'Web' },
                  { icon: Smartphone, label: 'iOS' },
                  { icon: Smartphone, label: 'Android' },
                ].map((device) => (
                  <span
                    key={device.label}
                    className="inline-flex items-center gap-1.5 rounded-full border bg-background px-3 py-1 text-xs font-medium text-foreground"
                  >
                    <device.icon className="size-3.5" aria-hidden />
                    {device.label}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
