import { useEffect, useRef, useState } from 'react';
import {
  ApiError,
  type Entitlements,
  type ScoreHistory,
} from '../../api/api-client';
import { useApiClient } from '../../api/use-api-client';
import { ErrorMessage } from '../../components/ErrorMessage';
import { Button, ButtonText } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Text } from '../../components/ui/text';

type HistoryState =
  | { status: 'idle' | 'loading' }
  | { status: 'success'; history: ScoreHistory }
  | { status: 'error'; message: string };

export function PremiumCard({ entitlements }: { entitlements: Entitlements }) {
  const api = useApiClient();
  const [state, setState] = useState<HistoryState>({ status: 'idle' });
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);

  async function loadHistory() {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setState({ status: 'loading' });
    try {
      const history = await api.getScoreHistory({ signal: controller.signal });
      if (!controller.signal.aborted) setState({ status: 'success', history });
    } catch (error) {
      if (!controller.signal.aborted)
        setState({
          status: 'error',
          message:
            error instanceof ApiError
              ? error.message
              : 'Unable to load history.',
        });
    }
  }

  return (
    <Card className="gap-4 rounded-2xl p-6">
      <Text className="text-2xl font-bold text-primary">
        {entitlements.tier === 'premium' ? 'Premium' : 'Free'}
      </Text>
      <Text className="text-foreground">
        {entitlements.tier === 'premium'
          ? 'Score history is available.'
          : 'Activate a local demo subscription to unlock score history.'}
      </Text>
      {entitlements.effectiveUntil && (
        <Text className="text-sm text-muted-foreground">
          Next access check:{' '}
          {new Date(entitlements.effectiveUntil).toLocaleString()}
        </Text>
      )}
      {entitlements.grants.map((grant) => (
        <Text
          key={`${grant.provider}:${grant.providerSubscriptionId}`}
          className="text-sm text-muted-foreground"
        >
          {grant.provider}: valid until{' '}
          {new Date(grant.validUntil).toLocaleString()}
        </Text>
      ))}
      {entitlements.warnings.length > 0 && (
        <Text className="text-sm text-muted-foreground">
          Some subscriptions have an unknown product or status and grant no
          access.
        </Text>
      )}
      <Button
        isDisabled={state.status === 'loading'}
        onPress={() => {
          void loadHistory();
        }}
      >
        <ButtonText>
          {state.status === 'loading'
            ? 'Loading history…'
            : 'Request score history'}
        </ButtonText>
      </Button>
      <ErrorMessage message={state.status === 'error' ? state.message : null} />
      {state.status === 'success' && (
        <>
          <Text className="font-bold text-foreground">
            Synthetic score history
          </Text>
          {state.history.points.map((point) => (
            <Text key={point.date} className="text-foreground">
              {point.date}: {point.score}
            </Text>
          ))}
        </>
      )}
      <Text className="text-xs text-muted-foreground">
        The API checks your permissions and subscription for every history
        request. No purchase is made in this demo.
      </Text>
    </Card>
  );
}
