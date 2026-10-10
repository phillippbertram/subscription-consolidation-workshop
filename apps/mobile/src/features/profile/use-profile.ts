import { useEffect, useState } from 'react';
import { ApiError, type UserProfile } from '../../api/api-client';
import { useApiClient } from '../../api/use-api-client';

type ProfileState =
  | { status: 'idle' | 'loading' }
  | { status: 'success'; profile: UserProfile }
  | { status: 'error'; message: string };

export function useProfile(enabled: boolean) {
  const api = useApiClient();
  const [state, setState] = useState<ProfileState>({ status: 'loading' });
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let active = true;
    setState({ status: 'loading' });

    async function load() {
      try {
        const profile = await api.getProfile({ signal: controller.signal });
        if (active) setState({ status: 'success', profile });
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
    reload: () => setRevision((value) => value + 1),
  };
}
