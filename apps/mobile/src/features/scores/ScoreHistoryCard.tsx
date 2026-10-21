import { View } from 'react-native';
import { ApiError } from '../../api/api-client';
import { useScoreHistory } from '../../api/use-account-queries';
import { ErrorMessage } from '../../components/ErrorMessage';
import { Badge } from '../../components/Brand';
import { Icon } from '../../components/Icon';
import { Button, ButtonText } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Spinner } from '../../components/ui/spinner';
import { Text } from '../../components/ui/text';
import { ScoreHistoryChart } from './ScoreHistoryChart';

interface ScoreHistoryCardProps {
  hasAccess: boolean | null;
  loading: boolean;
  onUpgrade: () => void;
}

/**
 * `hasAccess` is null while the account is loading or unavailable. The card
 * then shows neither the locked teaser nor data, because neither is verified.
 */
export function ScoreHistoryCard({
  hasAccess,
  loading,
  onUpgrade,
}: ScoreHistoryCardProps) {
  const query = useScoreHistory(hasAccess === true);
  const history = hasAccess && query.isSuccess ? query.data : null;
  const errorMessage = query.isPaused
    ? 'You are offline. Reconnect to load your score history.'
    : query.error instanceof ApiError
      ? query.error.message
      : 'Unable to load your score history. Please retry.';
  const latest = history?.points.at(-1);
  const previous = history?.points.at(-2);
  const change = latest && previous ? latest.score - previous.score : null;

  return (
    <Card className="gap-5 rounded-2xl p-5">
      <View className="flex-row flex-wrap items-center justify-between gap-2">
        <Text
          accessibilityRole="header"
          className="text-lg font-semibold text-foreground"
        >
          Score history
        </Text>
        {hasAccess !== null && (
          <Badge
            label={hasAccess ? 'Premium' : 'Premium feature'}
            tone={hasAccess ? 'default' : 'secondary'}
          />
        )}
      </View>
      {(loading || (hasAccess && query.isPending && !query.isPaused)) && (
        <View className="min-h-40 items-center justify-center gap-3">
          <Spinner accessibilityLabel="Loading score history" />
          <Text className="text-sm text-muted-foreground">
            {loading ? 'Checking your access…' : 'Loading your history…'}
          </Text>
        </View>
      )}
      {hasAccess === null && !loading && (
        <Text className="text-muted-foreground">
          Refresh your account to check access to your history.
        </Text>
      )}
      {hasAccess === false && (
        <View className="items-center gap-3 rounded-xl border border-border bg-muted px-5 py-8">
          <View className="h-10 w-10 items-center justify-center rounded-full border border-border bg-card">
            <Icon name="lock" size={16} />
          </View>
          <Text className="font-semibold text-foreground">
            Unlock your score history
          </Text>
          <Text className="text-center text-sm text-muted-foreground">
            See how your score develops month by month. Included in Premium on
            every device.
          </Text>
          <Button className="mt-1 rounded-xl" onPress={onUpgrade}>
            <ButtonText>Upgrade to Premium</ButtonText>
            <Icon name="chevron" size={16} color="primary-foreground" />
          </Button>
        </View>
      )}
      {hasAccess && (query.isError || (query.isPaused && !history)) && (
        <View className="gap-3">
          <ErrorMessage message={errorMessage} />
          <Button variant="outline" onPress={() => void query.refetch()}>
            <ButtonText>Retry score history</ButtonText>
          </Button>
        </View>
      )}
      {latest && history && (
        <>
          <View className="gap-1">
            <View className="flex-row flex-wrap items-end gap-x-3">
              <Text className="text-6xl font-semibold text-foreground">
                {latest.score}
              </Text>
              {change !== null && (
                <View className="mb-2.5 flex-row items-center gap-1">
                  <Icon
                    name={change < 0 ? 'trendingDown' : 'trendingUp'}
                    size={16}
                    color={change < 0 ? 'muted-foreground' : 'success'}
                  />
                  <Text
                    className={`text-sm font-medium ${change < 0 ? 'text-muted-foreground' : 'text-success'}`}
                  >
                    {change >= 0 ? '+' : ''}
                    {change} since last month
                  </Text>
                </View>
              )}
            </View>
            <Text className="text-sm text-muted-foreground">
              Latest score ·{' '}
              {new Date(`${latest.date}T00:00:00`).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}{' '}
              · Synthetic demo data
            </Text>
          </View>
          <ScoreHistoryChart points={history.points} />
        </>
      )}
      {history && !latest && (
        <Text className="py-4 text-muted-foreground">
          No score history yet.
        </Text>
      )}
    </Card>
  );
}
