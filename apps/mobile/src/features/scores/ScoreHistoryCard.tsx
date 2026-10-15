import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { ApiError } from '../../api/api-client';
import type { ScoreHistory } from '@premiumpass/api-contracts';
import { useApiClient } from '../../api/use-api-client';
import { ErrorMessage } from '../../components/ErrorMessage';
import { Button, ButtonText } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Spinner } from '../../components/ui/spinner';
import { Text } from '../../components/ui/text';
import { ScoreHistoryChart } from './ScoreHistoryChart';

type HistoryState =
  | { status: 'loading' }
  | { status: 'success'; history: ScoreHistory }
  | { status: 'error'; message: string };

interface ScoreHistoryCardProps {
  hasAccess: boolean | null;
  loading: boolean;
}

export function ScoreHistoryCard({
  hasAccess,
  loading,
}: ScoreHistoryCardProps) {
  const api = useApiClient();
  const [state, setState] = useState<HistoryState>({ status: 'loading' });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    setState({ status: 'loading' });
    if (!hasAccess) {
      return;
    }

    const controller = new AbortController();

    async function loadHistory() {
      try {
        const history = await api.getScoreHistory({
          signal: controller.signal,
        });
        if (!controller.signal.aborted) {
          setState({
            status: 'success',
            history: {
              ...history,
              points: [...history.points].sort((a, b) =>
                a.date.localeCompare(b.date),
              ),
            },
          });
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setState({
            status: 'error',
            message:
              error instanceof ApiError
                ? error.message
                : 'Unable to load your score history. Please retry.',
          });
        }
      }
    }

    void loadHistory();
    return () => controller.abort();
  }, [api, hasAccess, revision]);

  const history =
    hasAccess && state.status === 'success' ? state.history : null;
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
      {(loading || (hasAccess && state.status === 'loading')) && (
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
      {hasAccess && state.status === 'error' && (
        <View className="gap-3">
          <ErrorMessage message={state.message} />
          <Button
            variant="outline"
            onPress={() => setRevision((value) => value + 1)}
          >
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
