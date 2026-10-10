import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import {
  ApiError,
  type Entitlements,
  type UserProfile,
} from '../../api/api-client';
import { useApiClient } from '../../api/use-api-client';

type ProfileState =
  | { status: 'idle' | 'loading' }
  | { status: 'success'; profile: UserProfile; entitlements: Entitlements }
  | { status: 'error'; message: string };

export function useProfile(enabled: boolean) {
  const api = useApiClient();
  const [state, setState] = useState<ProfileState>({ status: 'loading' });
  const [revision, setRevision] = useState(0);

  const reload = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    if (!enabled) return;
    const subscription = AppState.addEventListener('change', (status) => {
      if (status === 'active') reload();
    });
    return () => subscription.remove();
  }, [enabled, reload]);

  useEffect(() => {
    if (
      !enabled ||
      state.status !== 'success' ||
      !state.entitlements.effectiveUntil
    )
      return;
    const delay =
      Date.parse(state.entitlements.effectiveUntil) -
      Date.parse(state.entitlements.evaluatedAt);
    const timer = setTimeout(
      reload,
      Math.max(0, Math.min(delay, 2_147_483_647)),
    );
    return () => clearTimeout(timer);
  }, [enabled, state, reload]);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let active = true;
    setState({ status: 'loading' });

    async function load() {
      try {
        const [profile, entitlements] = await Promise.all([
          api.getProfile({ signal: controller.signal }),
          api.getEntitlements({ signal: controller.signal }),
        ]);
        if (active) setState({ status: 'success', profile, entitlements });
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
