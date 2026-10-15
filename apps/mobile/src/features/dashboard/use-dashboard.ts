import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { ApiError } from '../../api/api-client';
import type {
  SubscriptionOverview,
  UserProfile,
} from '@premiumpass/api-contracts';
import { useApiClient } from '../../api/use-api-client';

type DashboardState =
  | { status: 'idle' | 'loading' }
  | { status: 'success'; profile: UserProfile; overview: SubscriptionOverview }
  | { status: 'error'; message: string };

export function useDashboard(enabled: boolean) {
  const api = useApiClient();
  const [state, setState] = useState<DashboardState>({ status: 'loading' });
  const [revision, setRevision] = useState(0);

  const reload = useCallback(() => {
    setState({ status: 'loading' });
    setRevision((value) => value + 1);
  }, []);
  useEffect(() => {
    if (!enabled) {
      return;
    }

    const subscription = AppState.addEventListener('change', (status) => {
      if (status === 'active') {
        reload();
      }
    });
    return () => subscription.remove();
  }, [enabled, reload]);

  useEffect(() => {
    if (
      !enabled ||
      state.status !== 'success' ||
      !state.overview.entitlements.effectiveUntil
    ) {
      return;
    }

    const delay =
      Date.parse(state.overview.entitlements.effectiveUntil) -
      Date.parse(state.overview.entitlements.evaluatedAt);
    const timer = setTimeout(
      reload,
      Math.max(0, Math.min(delay, 2_147_483_647)),
    );
    return () => clearTimeout(timer);
  }, [enabled, state, reload]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const controller = new AbortController();
    let active = true;
    setState({ status: 'loading' });

    async function load() {
      try {
        const [profile, overview] = await Promise.all([
          api.getProfile({ signal: controller.signal }),
          api.getSubscriptionOverview({ signal: controller.signal }),
        ]);
        if (active) {
          setState({ status: 'success', profile, overview });
        }
      } catch (error) {
        if (active) {
          setState({
            status: 'error',
            message:
              error instanceof ApiError
                ? error.message
                : 'Unable to load your profile. Please retry.',
          });
        }
      }
    }

    void load();
    return () => {
      active = false;
      controller.abort();
    };
  }, [api, enabled, revision]);

  return {
    state: enabled ? state : ({ status: 'idle' } as const),
    reload,
  };
}
