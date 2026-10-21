import { useCallback, useEffect, useRef, useState } from 'react';
import type { AdminState } from '@premiumpass/api-contracts/admin';
import { AdminApiError, type AdminClient } from './admin-client';

export interface AdminStateResult {
  state: AdminState | null;
  error: AdminApiError | null;
  loading: boolean;
  reload: () => Promise<void>;
  autoRefresh: boolean;
  setAutoRefresh: (enabled: boolean) => void;
}

/**
 * One request returns everything the pages show, read at one moment.
 * Pages never fetch on their own, so all numbers on screen stay consistent.
 * Auto-refresh polls every five seconds, e.g. to watch an outbox entry turn sent.
 */
export function useAdminState(client: AdminClient): AdminStateResult {
  const [state, setState] = useState<AdminState | null>(null);
  const [error, setError] = useState<AdminApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const inFlight = useRef(false);

  const reload = useCallback(async () => {
    // Skip a poll while the previous request is still running.
    if (inFlight.current) {
      return;
    }

    inFlight.current = true;
    setLoading(true);
    try {
      setState(await client.state());
      setError(null);
    } catch (caught) {
      setError(
        caught instanceof AdminApiError
          ? caught
          : new AdminApiError('invalid_response', 0),
      );
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!autoRefresh) {
      return;
    }

    const timer = window.setInterval(() => void reload(), 5_000);
    return () => window.clearInterval(timer);
  }, [autoRefresh, reload]);

  return { state, error, loading, reload, autoRefresh, setAutoRefresh };
}
