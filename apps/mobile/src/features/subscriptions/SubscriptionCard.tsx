import { View } from 'react-native';
import type {
  Entitlements,
  SubscriptionOverview,
} from '@premiumpass/api-contracts';
import { appendToSummary } from '../../api/failure-details';
import { Badge } from '../../components/Brand';
import { Icon, type IconName } from '../../components/Icon';
import { Card } from '../../components/ui/card';
import { Text } from '../../components/ui/text';
import { Button, ButtonText } from '../../components/ui/button';
import { ErrorMessage } from '../../components/ErrorMessage';
import {
  describeMembership,
  describeSubscription,
  findGrantSubscription,
  formatAccessDate,
  planName,
  providerLabels,
} from './subscription-presentation';

type Grant = Entitlements['grants'][number];

interface StatusProps {
  overview: SubscriptionOverview | null;
  error: string | null;
  onReload: () => void;
}

function sourceIcon(grant: Grant): IconName {
  if (grant.source === 'admin') {
    return 'gift';
  }

  return grant.provider === 'stripe' ? 'globe' : 'smartphone';
}

function grantKey(grant: Grant) {
  return grant.source === 'admin'
    ? `admin:${grant.grantId}`
    : `${grant.provider}:${grant.providerSubscriptionId}`;
}

function PlanTitle({
  overview,
  large,
}: {
  overview: SubscriptionOverview;
  large?: boolean;
}) {
  const membership = describeMembership(overview);
  const premium = overview.entitlements.tier === 'premium';
  return (
    <View className="flex-row flex-wrap items-center gap-3">
      <View className="flex-row items-center gap-2">
        {premium && (
          <Icon name="sparkles" size={large ? 20 : 16} color="primary" />
        )}
        <Text
          className={`font-semibold text-foreground ${large ? 'text-2xl' : 'text-xl'}`}
        >
          {premium ? 'Premium' : 'Free'}
        </Text>
      </View>
      <Badge label={membership.label} tone={membership.tone} />
    </View>
  );
}

function Unavailable({ error, onReload }: Omit<StatusProps, 'overview'>) {
  return (
    <View className="gap-3">
      {error ? (
        <>
          <ErrorMessage
            message={appendToSummary(
              error,
              'No current access status could be verified.',
            )}
          />
          <Button variant="outline" className="rounded-xl" onPress={onReload}>
            <ButtonText>Try again</ButtonText>
          </Button>
        </>
      ) : (
        <Text className="text-muted-foreground">
          Checking your subscription…
        </Text>
      )}
    </View>
  );
}

/** The full current-plan card on the Billing tab, with every access source. */
export function SubscriptionCard({ overview, error, onReload }: StatusProps) {
  const membership = overview && describeMembership(overview);
  return (
    <Card className="gap-4 rounded-2xl p-5">
      <Text className="text-sm text-muted-foreground">Current plan</Text>
      {!overview || !membership ? (
        <Unavailable error={error} onReload={onReload} />
      ) : (
        <>
          <PlanTitle overview={overview} large />
          <Text className="text-muted-foreground">{membership.headline}</Text>
          {membership.needsAttention && (
            <View className="gap-1 rounded-xl border border-warning/30 bg-warning/5 p-4">
              <Text className="font-medium text-foreground">
                A subscription needs attention
              </Text>
              <Text className="text-sm text-muted-foreground">
                Check the subscription history below or refresh before making
                another purchase.
              </Text>
            </View>
          )}
          {overview.entitlements.grants.length > 0 && (
            <View className="gap-3">
              <Text className="text-sm font-medium text-foreground">
                Your access comes from
              </Text>
              <View className="rounded-xl border border-border">
                {overview.entitlements.grants.map((grant, index) => (
                  <AccessSource
                    key={grantKey(grant)}
                    grant={grant}
                    overview={overview}
                    first={index === 0}
                  />
                ))}
              </View>
              {overview.entitlements.grants.length > 1 && (
                <Text className="text-xs text-muted-foreground">
                  Premium stays active while at least one source is valid.
                  Ending one never removes another.
                </Text>
              )}
            </View>
          )}
        </>
      )}
    </Card>
  );
}

function AccessSource({
  grant,
  overview,
  first,
}: {
  grant: Grant;
  overview: SubscriptionOverview;
  first: boolean;
}) {
  const subscription = findGrantSubscription(grant, overview);
  const description =
    subscription && describeSubscription(subscription, overview);
  const evaluatedAt = overview.entitlements.evaluatedAt;
  const lines = [
    grant.validUntil
      ? `Access until ${formatAccessDate(grant.validUntil, evaluatedAt)}`
      : 'Access until revoked',
    grant.source === 'admin' ? 'Granted by an administrator' : null,
    description?.renewal
      ? `Auto-renewal ${description.renewal.toLowerCase()}`
      : null,
    description && !['Active', 'Ending', 'Trial'].includes(description.badge)
      ? description.status
      : null,
    subscription?.provider === 'stripe'
      ? 'Manage or cancel on the website'
      : null,
  ].filter((line) => line !== null);

  return (
    <View
      className={`flex-row gap-3 p-4 ${first ? '' : 'border-t border-border'}`}
    >
      <View className="h-8 w-8 items-center justify-center rounded-lg bg-secondary">
        <Icon name={sourceIcon(grant)} size={16} color="muted-foreground" />
      </View>
      <View className="flex-1 gap-0.5">
        <Text className="text-sm font-medium text-foreground">
          {grant.source === 'admin'
            ? 'Complimentary Premium'
            : providerLabels[grant.provider]}
          {subscription && (
            <Text className="font-normal text-muted-foreground">
              {' '}
              · {planName(subscription.productId)}
            </Text>
          )}
        </Text>
        {lines.map((line) => (
          <Text key={line} className="text-sm text-muted-foreground">
            {line}
          </Text>
        ))}
      </View>
    </View>
  );
}

/** The compact membership card on the Overview tab. */
export function MembershipSummary({
  overview,
  error,
  onReload,
  onOpenBilling,
}: StatusProps & { onOpenBilling: () => void }) {
  const membership = overview && describeMembership(overview);
  const free = overview?.entitlements.tier === 'free';
  return (
    <Card className="gap-4 rounded-2xl p-5">
      <Text className="text-sm text-muted-foreground">Membership</Text>
      {!overview || !membership ? (
        <Unavailable error={error} onReload={onReload} />
      ) : (
        <>
          <PlanTitle overview={overview} />
          <Text className="text-sm text-muted-foreground">
            {membership.headline}
          </Text>
          {overview.entitlements.grants.map((grant) => {
            const subscription = findGrantSubscription(grant, overview);
            return (
              <View
                key={grantKey(grant)}
                className="flex-row items-center gap-2"
              >
                <Icon
                  name={sourceIcon(grant)}
                  size={16}
                  color="muted-foreground"
                />
                <Text className="text-sm font-medium text-foreground">
                  {grant.source === 'admin'
                    ? 'Complimentary Premium'
                    : `${providerLabels[grant.provider]}${subscription ? ` · ${planName(subscription.productId)}` : ''}`}
                </Text>
              </View>
            );
          })}
        </>
      )}
      <Button
        variant={free ? 'default' : 'outline'}
        className="min-h-11 rounded-xl"
        onPress={onOpenBilling}
      >
        <ButtonText>
          {free ? 'Upgrade to Premium' : 'Manage billing'}
        </ButtonText>
        <Icon
          name="chevron"
          size={16}
          color={free ? 'primary-foreground' : 'foreground'}
        />
      </Button>
    </Card>
  );
}
