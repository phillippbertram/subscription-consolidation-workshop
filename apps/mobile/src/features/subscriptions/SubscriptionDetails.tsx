import { Modal, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { SubscriptionOverview } from '@premiumpass/api-contracts';
import { GluestackUIProvider } from '../../components/ui/gluestack-ui-provider';
import { Button, ButtonText } from '../../components/ui/button';
import { Text } from '../../components/ui/text';
import { Card } from '../../components/ui/card';
import { ErrorMessage } from '../../components/ErrorMessage';
import {
  describeSubscription,
  formatAccessDate,
} from './subscription-presentation';

export function SubscriptionDetails({
  visible,
  overview,
  error,
  onClose,
}: {
  visible: boolean;
  overview: SubscriptionOverview | null;
  error: string | null;
  onClose: () => void;
}) {
  const records =
    overview?.subscriptions
      .map((subscription) => ({
        subscription,
        description: describeSubscription(subscription, overview),
      }))
      .sort(
        (a, b) =>
          Number(b.description.hasAccess) - Number(a.description.hasAccess),
      ) ?? [];
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <GluestackUIProvider>
        <SafeAreaView className="flex-1 bg-background">
          <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
            <View className="gap-5 p-6">
              <View className="flex-row flex-wrap items-center justify-between gap-3">
                <Text className="text-2xl font-semibold text-foreground">
                  Subscription details
                </Text>
                <Button variant="outline" onPress={onClose}>
                  <ButtonText>Close</ButtonText>
                </Button>
              </View>
              <Text className="text-sm text-muted-foreground">
                Current and previous subscriptions, with their latest recorded
                status.
              </Text>
              <ErrorMessage message={error} />
              {!overview && !error && (
                <Text>Refreshing subscription details…</Text>
              )}
              {overview && (
                <>
                  <Text className="text-sm text-muted-foreground">
                    Current access:{' '}
                    {overview.entitlements.tier === 'premium'
                      ? 'Premium'
                      : 'Free'}
                  </Text>
                  {records.length === 0 && (
                    <Text>No subscriptions recorded yet.</Text>
                  )}
                  {records.map(({ subscription, description }) => (
                    <Card
                      key={`${subscription.provider}:${subscription.providerSubscriptionId}`}
                      className="gap-3 rounded-xl border border-border p-4"
                    >
                      <View className="flex-row flex-wrap items-center justify-between gap-2">
                        <Text className="font-semibold text-foreground">
                          {description.provider}
                        </Text>
                        <Text className="text-sm text-primary">
                          {description.badge}
                        </Text>
                      </View>
                      <Text className="text-sm text-muted-foreground">
                        {description.hasAccess
                          ? 'Grants current access'
                          : 'No current access from this subscription'}
                      </Text>
                      <Text className="text-sm text-foreground">
                        {description.status}
                      </Text>
                      {description.validUntil && (
                        <DetailField
                          label={description.boundaryLabel}
                          value={formatAccessDate(
                            description.validUntil,
                            overview.entitlements.evaluatedAt,
                          )}
                        />
                      )}
                      {description.renewal && (
                        <DetailField
                          label="Auto-renewal"
                          value={description.renewal}
                        />
                      )}
                      <DetailField
                        label="Last provider check"
                        value={formatAccessDate(
                          subscription.verifiedAt,
                          overview.entitlements.evaluatedAt,
                        )}
                      />
                      <DetailField
                        label="Subscription ID"
                        value={subscription.providerSubscriptionId}
                      />
                    </Card>
                  ))}
                  {overview.entitlements.warnings.length > 0 && (
                    <Text className="text-muted-foreground">
                      Some subscriptions could not be verified. Refresh before
                      making another purchase.
                    </Text>
                  )}
                </>
              )}
            </View>
          </ScrollView>
        </SafeAreaView>
      </GluestackUIProvider>
    </Modal>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <View className="gap-1">
      <Text className="text-xs text-muted-foreground">{label}</Text>
      <Text selectable className="text-sm text-foreground">
        {value}
      </Text>
    </View>
  );
}
