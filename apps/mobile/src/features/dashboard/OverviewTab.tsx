import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { SubscriptionOverview } from '@premiumpass/api-contracts';
import { PageHeader } from '../../components/Brand';
import { Icon, type IconName } from '../../components/Icon';
import { Card } from '../../components/ui/card';
import { Text } from '../../components/ui/text';
import { ScoreHistoryCard } from '../scores/ScoreHistoryCard';
import { MembershipSummary } from '../subscriptions/SubscriptionCard';

const devices: { icon: IconName; label: string }[] = [
  { icon: 'laptop', label: 'Web' },
  { icon: 'smartphone', label: 'iOS' },
  { icon: 'smartphone', label: 'Android' },
];

export function OverviewTab({
  name,
  overview,
  error,
  loading,
  onReload,
  onOpenBilling,
  refreshButton,
}: {
  name: string | undefined;
  overview: SubscriptionOverview | null;
  error: string | null;
  loading: boolean;
  onReload: () => void;
  onOpenBilling: () => void;
  refreshButton: ReactNode;
}) {
  return (
    <>
      <PageHeader
        title={name ? `Welcome back, ${name}` : 'Welcome back'}
        description="Your score and membership at a glance."
        action={refreshButton}
      />
      <ScoreHistoryCard
        // Unknown while loading or after an error: show neither data nor a paywall.
        hasAccess={
          overview
            ? overview.entitlements.features.includes('score_history')
            : null
        }
        loading={loading}
        onUpgrade={onOpenBilling}
      />
      <MembershipSummary
        overview={overview}
        error={error}
        onReload={onReload}
        onOpenBilling={onOpenBilling}
      />
      <Card className="gap-3 rounded-2xl p-5">
        <Text className="font-semibold text-foreground">
          Same account everywhere
        </Text>
        <Text className="text-sm text-muted-foreground">
          Sign in on the website or another device with this account. Your
          membership is already there, wherever you bought it.
        </Text>
        <View className="flex-row gap-2">
          {devices.map((device) => (
            <View
              key={device.label}
              className="flex-row items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1"
            >
              <Icon name={device.icon} size={14} />
              <Text className="text-xs font-medium text-foreground">
                {device.label}
              </Text>
            </View>
          ))}
        </View>
      </Card>
    </>
  );
}
