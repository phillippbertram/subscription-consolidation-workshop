import { useCallback, useEffect, useState } from 'react';
import { WebApiError } from '../../api/api-client';
import type {
  UserProfile,
  Entitlements,
  Subscription,
} from '@premiumpass/api-contracts';
import { useApiClient } from '../../api/use-api-client';

export type AccountState =
  | { status: 'idle' | 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'success';
      profile: UserProfile;
      entitlements: Entitlements;
      subscriptions: Subscription[];
      receivedAt: number;
    };

export function useAccount(enabled: boolean) {
  const api = useApiClient();
  const [state, setState] = useState<AccountState>({ status: 'loading' });
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const refreshVisible = () => {
      if (document.visibilityState === 'visible') {
        reload();
      }
    };

    window.addEventListener('focus', refreshVisible);
    document.addEventListener('visibilitychange', refreshVisible);
    return () => {
      window.removeEventListener('focus', refreshVisible);
      document.removeEventListener('visibilitychange', refreshVisible);
    };
  }, [enabled, reload]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const controller = new AbortController();
    setState({ status: 'loading' });
    // A checkout redirect is only navigation. Access always comes from the API.
    void Promise.all([
      api.getProfile(controller.signal),
      api.getSubscriptions(controller.signal),
      api.getEntitlements(controller.signal),
    ])
      .then(([profile, result, entitlements]) => {
        if (!controller.signal.aborted) {
          setState({
            status: 'success',
            profile,
            subscriptions: result.subscriptions,
            entitlements,
            receivedAt: performance.now(),
          });
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setState({
            status: 'error',
            message:
              error instanceof WebApiError
                ? error.message
                : 'Unable to load your account. Check the backend and retry.',
          });
        }
      });
    return () => controller.abort();
  }, [api, enabled, revision]);

  useEffect(() => {
    if (
      !enabled ||
      state.status !== 'success' ||
      !state.entitlements.effectiveUntil
    ) {
      return;
    }

    // Use server-relative time, then discard the displayed snapshot while refreshing.
    const delay =
      Date.parse(state.entitlements.effectiveUntil) -
      Date.parse(state.entitlements.evaluatedAt) -
      (performance.now() - state.receivedAt);
    const timer = window.setTimeout(
      reload,
      Math.max(0, Math.min(delay, 2_147_483_647)),
    );
    return () => window.clearTimeout(timer);
  }, [enabled, state, reload]);

  return { state: enabled ? state : ({ status: 'idle' } as const), reload };
}
