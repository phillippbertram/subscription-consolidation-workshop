import type { ReactNode } from 'react';
import { Platform, View } from 'react-native';
import type { SubscriptionOverview } from '@premiumpass/api-contracts';
import { CheckList, PageHeader } from '../../components/Brand';
import { Icon, type IconName } from '../../components/Icon';
import { Card } from '../../components/ui/card';
import { Text } from '../../components/ui/text';
import { SubscriptionCard } from './SubscriptionCard';
import { SubscriptionDetails } from './SubscriptionDetails';

const android = Platform.OS === 'android';
const storeName = android ? 'Google Play' : 'App Store';
const storeArticle = android ? 'a' : 'an';
const storeWithArticle = android ? 'Google Play' : 'the App Store';

const helpItems: { icon: IconName; title: string; text: string }[] = [
  {
    icon: 'shieldCheck',
    title: 'Verified, not assumed',
    text: 'Premium starts when the backend has verified the purchase with the store, never because a purchase sheet closed.',
  },
  {
    icon: 'globe',
    title: 'Bought on the website?',
    text: 'Website subscriptions show up here too. Manage or cancel them on the website.',
  },
  {
    icon: 'circleCheck',
    title: 'Cancel anytime',
    text: 'Cancelling turns off auto-renewal. You keep Premium until the period you paid for ends.',
  },
  {
    icon: 'zap',
    title: 'Test mode only',
    text: 'Purchases use the store sandbox or license testing. No real money is charged.',
  },
];

/**
 * Plan, store actions, and history. `storeActions` comes from the always
 * mounted store component in DashboardScreen, so switching tabs never drops a
 * purchase listener while a transaction is being verified.
 */
export function BillingTab({
  overview,
  error,
  onReload,
  storeActions,
  refreshButton,
}: {
  overview: SubscriptionOverview | null;
  error: string | null;
  onReload: () => void;
  storeActions: ReactNode;
  refreshButton: ReactNode;
}) {
  const free = overview?.entitlements.tier === 'free';
  return (
    <>
      <PageHeader
        title="Billing"
        description="Your plan, your access, and every subscription on your account."
        action={refreshButton}
      />
      <SubscriptionCard overview={overview} error={error} onReload={onReload} />
      {storeActions && (
        <Card className="gap-4 rounded-2xl p-5">
          <View className="gap-1">
            <Text className="text-lg font-semibold text-foreground">
              {free ? 'Upgrade to Premium' : storeName}
            </Text>
            <Text className="text-sm text-muted-foreground">
              {free
                ? `Subscribe through ${storeWithArticle}. Premium unlocks the same features on the website and in every app.`
                : `Restore purchases or manage ${storeArticle} ${storeName} subscription on this device.`}
            </Text>
          </View>
          {free && (
            <CheckList
              items={[
                'Your full score history',
                'Premium on web, iOS, and Android',
                'Cancel anytime, keep access until the period ends',
              ]}
            />
          )}
          {storeActions}
        </Card>
      )}
      <SubscriptionDetails overview={overview} />
      <Card className="gap-4 rounded-2xl bg-muted p-5 shadow-none">
        <Text className="font-semibold text-foreground">How billing works</Text>
        {helpItems.map((item) => (
          <View key={item.title} className="flex-row gap-3">
            <Icon name={item.icon} size={16} color="primary" />
            <View className="flex-1 gap-0.5">
              <Text className="text-sm font-medium text-foreground">
                {item.title}
              </Text>
              <Text className="text-sm text-muted-foreground">{item.text}</Text>
            </View>
          </View>
        ))}
      </Card>
    </>
  );
}
