import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../../api/api-client';
import type {
  SubscriptionOverview,
  UserProfile,
} from '@premiumpass/api-contracts';
import {
  accountQueryKeys,
  useProfile,
  useSubscriptionOverview,
} from '../../api/use-account-queries';

type DashboardState =
  | { status: 'idle' | 'loading' }
  | { status: 'success'; profile: UserProfile; overview: SubscriptionOverview }
  | { status: 'error'; message: string };

export function useDashboard(enabled: boolean) {
  const client = useQueryClient();
  const profile = useProfile(enabled);
  const overview = useSubscriptionOverview(enabled);
  const [expiredSnapshot, setExpiredSnapshot] = useState<number | null>(null);
  const effectiveUntil = overview.data?.entitlements.effectiveUntil;
  const evaluatedAt = overview.data?.entitlements.evaluatedAt;
  // Preserve the backend-relative lifetime without restarting it on cache reads.
  const expiresAt =
    effectiveUntil && evaluatedAt
      ? overview.dataUpdatedAt +
        Date.parse(effectiveUntil) -
        Date.parse(evaluatedAt)
      : null;
  const expired =
    expiresAt !== null &&
    (Date.now() >= expiresAt || expiredSnapshot === overview.dataUpdatedAt);

  const reload = useCallback(() => {
    void client.invalidateQueries({ queryKey: accountQueryKeys.all });
  }, [client]);

  useEffect(() => {
    if (!enabled || expiresAt === null) {
      return;
    }

    const deadline = expiresAt;
    let timer: ReturnType<typeof setTimeout>;

    function checkExpiry() {
      const remaining = deadline - Date.now();
      if (remaining > 0) {
        timer = setTimeout(checkExpiry, Math.min(remaining, 2_147_483_647));
        return;
      }

      setExpiredSnapshot(overview.dataUpdatedAt);
      reload();
    }

    checkExpiry();
    return () => clearTimeout(timer);
  }, [enabled, expiresAt, overview.dataUpdatedAt, reload]);

  let state: DashboardState;
  const error = profile.error ?? overview.error;
  if (!enabled) {
    state = { status: 'idle' };
  } else if (error) {
    state = {
      status: 'error',
      message:
        error instanceof ApiError
          ? error.message
          : 'Unable to load your profile. Please retry.',
    };
  } else if (expired) {
    state = overview.isFetching
      ? { status: 'loading' }
      : {
          status: 'error',
          message:
            'Your access needs to be checked again. Connect and refresh.',
        };
  } else if (profile.data && overview.data) {
    state = {
      status: 'success',
      profile: profile.data,
      overview: overview.data,
    };
  } else if (profile.isPaused || overview.isPaused) {
    state = {
      status: 'error',
      message: 'You are offline. Reconnect to load your account.',
    };
  } else {
    state = { status: 'loading' };
  }

  return {
    state,
    reload,
    isRefreshing: enabled && (profile.isFetching || overview.isFetching),
  };
}
