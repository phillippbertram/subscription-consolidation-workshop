import { View } from 'react-native';
import { ApiError } from '../../api/api-client';
import { useScoreHistory } from '../../api/use-account-queries';
import { ErrorMessage } from '../../components/ErrorMessage';
import { Button, ButtonText } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Spinner } from '../../components/ui/spinner';
import { Text } from '../../components/ui/text';
import { ScoreHistoryChart } from './ScoreHistoryChart';

interface ScoreHistoryCardProps {
  hasAccess: boolean | null;
  loading: boolean;
}

export function ScoreHistoryCard({
  hasAccess,
  loading,
}: ScoreHistoryCardProps) {
  const query = useScoreHistory(hasAccess === true);
  const history = hasAccess && query.isSuccess ? query.data : null;
  const errorMessage = query.isPaused
    ? 'You are offline. Reconnect to load your score history.'
    : query.error instanceof ApiError
      ? query.error.message
      : 'Unable to load your score history. Please retry.';
  const latest = history?.points.at(-1);
  return (
    <Card className="gap-4 rounded-3xl border-0 bg-secondary p-6 shadow-none">
      <View className="flex-row flex-wrap items-center justify-between gap-2">
        <Text
          accessibilityRole="header"
          className="text-lg font-semibold text-foreground"
        >
          Score history
        </Text>
        {hasAccess !== null && (
          <Text className="text-xs font-medium text-primary">
            {hasAccess ? 'Premium' : 'Premium feature'}
          </Text>
        )}
      </View>
      {(loading || (hasAccess && query.isPending && !query.isPaused)) && (
        <View className="min-h-32 items-center justify-center gap-3">
          <Spinner accessibilityLabel="Loading score history" />
          <Text className="text-sm text-muted-foreground">
            {loading ? 'Checking your access…' : 'Loading your history…'}
          </Text>
        </View>
      )}
      {hasAccess === null && !loading && (
        <Text className="text-muted-foreground">
          Refresh your subscription to check access to your history.
        </Text>
      )}
      {hasAccess === false && (
        <View className="gap-2 py-4">
          <Text className="text-xl font-medium text-foreground">
            Your score over time
          </Text>
          <Text className="text-muted-foreground">
            Unlock your score history with Premium. Your history will appear
            here once your subscription is active.
          </Text>
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
            <Text className="text-6xl font-medium text-foreground">
              {latest.score}
            </Text>
            <Text className="text-sm text-muted-foreground">
              Latest score ·{' '}
              {new Date(`${latest.date}T00:00:00`).toLocaleDateString(
                undefined,
                { month: 'short', day: 'numeric', year: 'numeric' },
              )}
            </Text>
          </View>
          <ScoreHistoryChart points={history.points} />
          <Text className="text-xs text-muted-foreground">
            Synthetic demo data · Score out of 100
          </Text>
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
