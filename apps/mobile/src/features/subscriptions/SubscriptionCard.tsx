import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { DeveloperDetails } from '../../components/DeveloperDetails';
import type { SubscriptionOverview } from '@premiumpass/api-contracts';
import { Card } from '../../components/ui/card';
import { Text } from '../../components/ui/text';
import { Button, ButtonText } from '../../components/ui/button';
import { ErrorMessage } from '../../components/ErrorMessage';
import { StoreSubscriptionActions } from './StoreSubscriptionActions';
import { SubscriptionDetails } from './SubscriptionDetails';
import {
  describeSubscription,
  formatAccessDate,
} from './subscription-presentation';

interface SubscriptionCardProps {
  overview: SubscriptionOverview | null;
  error: string | null;
  onReload: () => void;
  developerDetails: ReactNode;
}

export function SubscriptionCard({
  overview,
  error,
  onReload,
  developerDetails,
}: SubscriptionCardProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const details =
    overview?.subscriptions.map((subscription) => ({
      ...describeSubscription(subscription, overview),
      key: `${subscription.provider}:${subscription.providerSubscriptionId}`,
    })) ?? [];
  const current = details.filter((subscription) => subscription.hasAccess);
  const premium = overview?.entitlements.tier === 'premium';
  const badge = premium ? 'Premium' : 'Free';
  const needsAttention =
    overview &&
    (overview.entitlements.warnings.length > 0 ||
      overview.subscriptions.some((subscription) =>
        ['pending', 'past_due', 'paused'].includes(subscription.state),
      ));
  return (
    <StoreSubscriptionActions overview={overview} onVerified={onReload}>
      {({ actions, sandboxControl }) => (
        <>
          <Card className="gap-4 rounded-[18px] border border-border p-5 shadow-none">
            <View className="flex-row flex-wrap items-center justify-between gap-2">
              <Text className="flex-1 text-[17px] font-medium text-foreground">
                Your Premium access
              </Text>
              {overview && (
                <Text className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-primary">
                  {badge}
                </Text>
              )}
            </View>
            {!overview && !error && (
              <Text className="text-muted-foreground">
                Checking your subscription…
              </Text>
            )}
            <ErrorMessage message={error} />
            {error && (
              <Button variant="outline" onPress={onReload}>
                <ButtonText>Try again</ButtonText>
              </Button>
            )}
            {overview && (
              <>
                {!premium && (
                  <Text className="text-sm text-muted-foreground">
                    You are on the Free plan. Premium unlocks your score
                    history.
                  </Text>
                )}
                {overview.entitlements.grants
                  .filter((grant) => grant.source === 'admin')
                  .map((grant) => (
                    <View key={`admin:${grant.grantId}`} className="gap-2">
                      <SubscriptionRow
                        label="Access source"
                        value="Complimentary Premium"
                      />
                      <SubscriptionRow
                        label="Available"
                        value={
                          grant.validUntil
                            ? `Until ${formatAccessDate(grant.validUntil, overview.entitlements.evaluatedAt)}`
                            : 'Until revoked'
                        }
                      />
                    </View>
                  ))}
                {current.map((subscription, index) => (
                  <View
                    key={subscription.key}
                    className={
                      index > 0 ? 'gap-2 border-t border-border pt-4' : 'gap-2'
                    }
                  >
                    <SubscriptionRow
                      label="Purchased through"
                      value={subscription.provider}
                    />
                    {subscription.badge !== 'Active' && (
                      <SubscriptionRow
                        label="Status"
                        value={subscription.badge}
                      />
                    )}
                    {subscription.validUntil && (
                      <SubscriptionRow
                        label={subscription.boundaryLabel}
                        value={formatAccessDate(
                          subscription.validUntil,
                          overview.entitlements.evaluatedAt,
                        )}
                      />
                    )}
                    {subscription.renewal && (
                      <SubscriptionRow
                        label="Auto-renewal"
                        value={subscription.renewal}
                      />
                    )}
                    {!['Active', 'Ending', 'Trial'].includes(
                      subscription.badge,
                    ) && (
                      <Text className="text-[13px] text-muted-foreground">
                        {subscription.status}
                      </Text>
                    )}
                  </View>
                ))}
                {needsAttention && (
                  <Text className="text-muted-foreground">
                    A subscription needs attention. Open details or refresh
                    before making a purchase.
                  </Text>
                )}
              </>
            )}
            {actions}
            {overview && (
              <Button variant="ghost" onPress={() => setDetailsOpen(true)}>
                <ButtonText>Subscription details</ButtonText>
              </Button>
            )}
          </Card>
          <SubscriptionDetails
            visible={detailsOpen}
            overview={overview}
            error={error}
            onClose={() => setDetailsOpen(false)}
          />
          <DeveloperDetails>
            {sandboxControl}
            {developerDetails}
          </DeveloperDetails>
        </>
      )}
    </StoreSubscriptionActions>
  );
}

function SubscriptionRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-start justify-between gap-3">
      <Text className="flex-1 text-[13px] leading-5 text-muted-foreground">
        {label}
      </Text>
      <Text className="flex-1 text-right text-[13px] leading-5 text-foreground">
        {value}
      </Text>
    </View>
  );
}
