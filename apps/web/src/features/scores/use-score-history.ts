import { useCallback, useEffect, useState } from 'react';
import type { ScoreHistory } from '@premiumpass/api-contracts';
import { WebApiError } from '../../api/api-client';
import { useApiClient } from '../../api/use-api-client';

export type ScoreHistoryState =
  | { status: 'idle' | 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; history: ScoreHistory };

/**
 * Loads the Premium feature itself. `enabled` follows the verified account
 * entitlements, which only decide whether to ask. The API checks the grant
 * again on this request, so a stale client state can never unlock the data.
 */
export function useScoreHistory(enabled: boolean) {
  const api = useApiClient();
  const [state, setState] = useState<ScoreHistoryState>({ status: 'loading' });
  const [revision, setRevision] = useState(0);
  const retry = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const controller = new AbortController();
    setState({ status: 'loading' });
    api
      .getScoreHistory(controller.signal)
      .then((history) => {
        if (!controller.signal.aborted) {
          setState({ status: 'success', history });
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setState({
            status: 'error',
            message:
              error instanceof WebApiError
                ? error.message
                : 'Unable to load your score history. Please retry.',
          });
        }
      });
    return () => controller.abort();
  }, [api, enabled, revision]);

  return { state: enabled ? state : ({ status: 'idle' } as const), retry };
}
