import { useState } from 'react';
import { Pressable, View } from 'react-native';
import type {
  Subscription,
  SubscriptionOverview,
} from '@premiumpass/api-contracts';
import { Badge } from '../../components/Brand';
import { Icon } from '../../components/Icon';
import { Text } from '../../components/ui/text';
import { Card } from '../../components/ui/card';
import {
  badgeTone,
  describeSubscription,
  formatAccessDate,
  planName,
} from './subscription-presentation';

/** Every recorded subscription across stores, current access first. Tap a row for details. */
export function SubscriptionDetails({
  overview,
}: {
  overview: SubscriptionOverview | null;
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
    <Card className="gap-4 rounded-2xl p-5">
      <View className="gap-1">
        <Text
          accessibilityRole="header"
          className="text-lg font-semibold text-foreground"
        >
          Subscription history
        </Text>
        <Text className="text-sm text-muted-foreground">
          Current and previous subscriptions from the website, App Store, and
          Google Play, with their latest verified status.
        </Text>
      </View>
      {!overview && (
        <Text className="text-sm text-muted-foreground">
          Subscription history is unavailable until your account loads.
        </Text>
      )}
      {overview && records.length === 0 && (
        <View className="rounded-xl border border-dashed border-border p-5">
          <Text className="text-center text-sm text-muted-foreground">
            No subscriptions yet. Purchases from any store appear here once they
            are verified.
          </Text>
        </View>
      )}
      {overview && records.length > 0 && (
        <View className="rounded-xl border border-border">
          {records.map(({ subscription, description }, index) => (
            <HistoryRow
              key={`${subscription.provider}:${subscription.providerSubscriptionId}`}
              subscription={subscription}
              description={description}
              evaluatedAt={overview.entitlements.evaluatedAt}
              first={index === 0}
            />
          ))}
        </View>
      )}
    </Card>
  );
}

function HistoryRow({
  subscription,
  description,
  evaluatedAt,
  first,
}: {
  subscription: Subscription;
  description: ReturnType<typeof describeSubscription>;
  evaluatedAt: string;
  first: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <View className={first ? '' : 'border-t border-border'}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityHint="Shows the subscription details"
        className="flex-row items-center gap-3 p-4 active:bg-muted"
        onPress={() => setExpanded(!expanded)}
      >
        <View className="h-8 w-8 items-center justify-center rounded-lg bg-secondary">
          <Icon
            name={subscription.provider === 'stripe' ? 'globe' : 'smartphone'}
            size={16}
            color="muted-foreground"
          />
        </View>
        <View className="flex-1">
          <Text className="text-sm font-medium text-foreground">
            {description.provider}
            <Text className="font-normal text-muted-foreground">
              {' '}
              · {planName(subscription.productId)}
            </Text>
          </Text>
          <Text className="text-sm text-muted-foreground">
            {description.validUntil
              ? `${description.boundaryLabel} ${formatAccessDate(description.validUntil, evaluatedAt)}`
              : 'No verified period'}
          </Text>
        </View>
        <Badge label={description.badge} tone={badgeTone(description.badge)} />
        <View style={{ transform: [{ rotate: expanded ? '180deg' : '0deg' }] }}>
          <Icon name="chevronDown" size={16} color="muted-foreground" />
        </View>
      </Pressable>
      {expanded && (
        <View className="gap-3 border-t border-border bg-muted px-4 py-4">
          <DetailField
            label="Access"
            value={
              description.hasAccess
                ? 'Grants current access'
                : 'No current access from this subscription'
            }
          />
          <DetailField label="Status" value={description.status} />
          {description.renewal && (
            <DetailField label="Auto-renewal" value={description.renewal} />
          )}
          <DetailField
            label="Last provider check"
            value={formatAccessDate(subscription.verifiedAt, evaluatedAt)}
          />
          <DetailField
            label="Subscription ID"
            value={subscription.providerSubscriptionId}
            mono
          />
        </View>
      )}
    </View>
  );
}

function DetailField({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <View className="gap-0.5">
      <Text className="text-xs text-muted-foreground">{label}</Text>
      <Text
        selectable
        className={
          mono ? 'font-mono text-xs text-foreground' : 'text-sm text-foreground'
        }
      >
        {value}
      </Text>
    </View>
  );
}
