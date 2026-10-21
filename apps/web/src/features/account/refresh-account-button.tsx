import { RefreshCw } from 'lucide-react';
import type { AccountState } from './use-account';
import { formatDate } from '../../lib/format-date';
import { Button } from '../../components/ui/button';

/** Account data also refreshes on focus and at access boundaries; this is the manual path. */
export function RefreshAccountButton({
  state,
  onRefresh,
}: {
  state: AccountState;
  onRefresh: () => void;
}) {
  const loading = state.status === 'loading';
  return (
    <div className="flex items-center gap-3">
      {state.status === 'success' && (
        <span className="hidden text-xs text-muted-foreground sm:inline">
          Checked {formatDate(state.entitlements.evaluatedAt)}
        </span>
      )}
      <Button variant="outline" onClick={onRefresh} disabled={loading}>
        <RefreshCw className={loading ? 'animate-spin' : ''} aria-hidden />
        {loading ? 'Refreshing…' : 'Refresh account'}
      </Button>
    </div>
  );
}
