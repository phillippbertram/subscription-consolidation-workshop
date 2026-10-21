import {
  ArrowRight,
  Lock,
  RefreshCw,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { AppLink } from '../../lib/navigation';
import { cn } from '../../lib/utils';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../../components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '../../components/ui/alert';
import { Skeleton } from '../../components/page-header';
import { ScoreChart } from './score-chart';
import { useScoreHistory } from './use-score-history';

/**
 * `hasAccess` is null while the account is loading or unavailable. The card
 * then shows neither the locked teaser nor data, because neither is verified.
 */
export function ScoreHistoryCard({ hasAccess }: { hasAccess: boolean | null }) {
  const { state, retry } = useScoreHistory(hasAccess === true);
  const points = state.status === 'success' ? state.history.points : [];
  const latest = points.at(-1);
  const previous = points.at(-2);
  const change = latest && previous ? latest.score - previous.score : null;
  const Trend = change !== null && change < 0 ? TrendingDown : TrendingUp;

  return (
    <Card className="h-full gap-6 py-6">
      <CardHeader className="px-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-lg font-semibold">Score history</CardTitle>
          {hasAccess !== null && (
            <Badge variant={hasAccess ? 'default' : 'secondary'}>
              {hasAccess ? 'Premium' : 'Premium feature'}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-1 px-6">
        {(hasAccess === null || state.status === 'loading') && (
          <div className="space-y-4" aria-label="Loading score history">
            <Skeleton className="h-12 w-28" />
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-44 w-full" />
          </div>
        )}
        {hasAccess === false && <LockedScoreHistory />}
        {state.status === 'error' && (
          <Alert variant="destructive">
            <AlertTitle>Score history unavailable</AlertTitle>
            <AlertDescription className="space-y-3">
              <p>{state.message}</p>
              <Button variant="outline" size="sm" onClick={retry}>
                <RefreshCw /> Retry
              </Button>
            </AlertDescription>
          </Alert>
        )}
        {state.status === 'success' && !latest && (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            No scores recorded yet.
          </p>
        )}
        {latest && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-end gap-x-4 gap-y-1">
              <p className="text-6xl font-semibold tracking-tight">
                {latest.score}
              </p>
              {change !== null && (
                <p
                  className={cn(
                    'mb-2 inline-flex items-center gap-1 text-sm font-medium',
                    change < 0 ? 'text-muted-foreground' : 'text-success',
                  )}
                >
                  <Trend className="size-4" aria-hidden />
                  {change >= 0 ? '+' : ''}
                  {change} since last month
                </p>
              )}
              <p className="w-full text-sm text-muted-foreground">
                Latest score ·{' '}
                {new Date(`${latest.date}T00:00:00`).toLocaleDateString(
                  'en-US',
                  { dateStyle: 'medium' },
                )}{' '}
                · Synthetic demo data
              </p>
            </div>
            <ScoreChart points={points} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LockedScoreHistory() {
  return (
    <div className="relative overflow-hidden rounded-xl border bg-muted/40">
      {/* A decorative silhouette of the feature; it contains no score data. */}
      <svg
        viewBox="0 0 640 220"
        className="h-56 w-full opacity-60 blur-[2px]"
        aria-hidden
      >
        <path
          d="M0,170 C90,150 140,165 210,120 S330,90 400,105 S520,60 640,50 L640,220 L0,220 Z"
          fill="var(--secondary)"
        />
        <path
          d="M0,170 C90,150 140,165 210,120 S330,90 400,105 S520,60 640,50"
          fill="none"
          stroke="var(--primary)"
          strokeOpacity="0.35"
          strokeWidth="4"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-card/40 p-6 text-center">
        <span className="flex size-10 items-center justify-center rounded-full bg-card shadow-sm ring-1 ring-foreground/10">
          <Lock className="size-4" aria-hidden />
        </span>
        <div className="space-y-1">
          <p className="font-semibold">Unlock your score history</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            See how your score develops month by month. Included in Premium on
            every device.
          </p>
        </div>
        <Button asChild>
          <AppLink to="/billing">
            Upgrade to Premium <ArrowRight />
          </AppLink>
        </Button>
      </div>
    </div>
  );
}
