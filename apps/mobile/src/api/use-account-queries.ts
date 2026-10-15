import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ScoreHistory } from '@premiumpass/api-contracts';
import { useApiClient } from './use-api-client';

// Keys are local to the identity-scoped SessionQueryProvider.
export const accountQueryKeys = {
  all: ['account'] as const,
  profile: ['account', 'profile'] as const,
  subscriptions: ['account', 'subscriptions'] as const,
  scoreHistory: ['account', 'score-history'] as const,
};

export function useProfile(enabled: boolean) {
  const api = useApiClient();
  return useQuery({
    queryKey: accountQueryKeys.profile,
    queryFn: ({ signal }) => api.getProfile({ signal }),
    enabled,
  });
}

export function useSubscriptionOverview(enabled: boolean) {
  const api = useApiClient();
  return useQuery({
    queryKey: accountQueryKeys.subscriptions,
    queryFn: ({ signal }) => api.getSubscriptionOverview({ signal }),
    staleTime: 0,
    enabled,
  });
}

function sortHistory(history: ScoreHistory): ScoreHistory {
  return {
    ...history,
    points: [...history.points].sort((a, b) => a.date.localeCompare(b.date)),
  };
}

export function useScoreHistory(enabled: boolean) {
  const api = useApiClient();
  const client = useQueryClient();
  useEffect(() => {
    if (!enabled) {
      void client.cancelQueries({ queryKey: accountQueryKeys.scoreHistory });
    }
  }, [client, enabled]);

  return useQuery({
    queryKey: accountQueryKeys.scoreHistory,
    queryFn: ({ signal }) => api.getScoreHistory({ signal }),
    select: sortHistory,
    enabled,
  });
}
