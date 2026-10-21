import type { ReactNode } from 'react';
import {
  Activity,
  LayoutDashboard,
  LockKeyhole,
  RefreshCw,
  Send,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { formatTime } from '@/lib/format';
import { AppLink, type Route } from '@/lib/navigation';
import { cn } from '@/lib/utils';
import type { AdminStateResult } from '@/api/use-admin-state';
import { AdminLogo, LocalTargetBadge } from './brand';

const navItems = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, pages: ['overview'] },
  { to: '/users', label: 'Users', icon: Users, pages: ['users', 'user'] },
  { to: '/outbox', label: 'Outbox', icon: Send, pages: ['outbox'] },
  {
    to: '/processing',
    label: 'Processing',
    icon: Activity,
    pages: ['processing'],
  },
] as const;

export function AppShell({
  route,
  data,
  onLock,
  children,
}: {
  route: Route;
  data: AdminStateResult;
  onLock: () => void;
  children: ReactNode;
}) {
  const { state, error, loading, reload, autoRefresh, setAutoRefresh } = data;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b bg-card/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
          <AppLink to="/" aria-label="Admin overview">
            <AdminLogo />
          </AppLink>
          <nav className="flex flex-wrap gap-1" aria-label="Main">
            {navItems.map((item) => {
              const active = (item.pages as readonly string[]).includes(
                route.page,
              );
              return (
                <AppLink
                  key={item.to}
                  to={item.to}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                    active && 'bg-muted text-foreground',
                  )}
                >
                  <item.icon className="size-4" aria-hidden />
                  {item.label}
                </AppLink>
              );
            })}
          </nav>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <LocalTargetBadge />
            {state && (
              <span className="text-xs text-muted-foreground">
                Read at{' '}
                <span className="font-mono text-foreground">
                  {formatTime(state.readAt)}
                </span>
              </span>
            )}
            <Button
              variant="outline"
              size="lg"
              onClick={() => void reload()}
              disabled={loading}
            >
              <RefreshCw
                className={cn(loading && 'animate-spin')}
                aria-hidden
              />
              Reload
            </Button>
            <Button
              variant={autoRefresh ? 'secondary' : 'ghost'}
              size="lg"
              aria-pressed={autoRefresh}
              onClick={() => setAutoRefresh(!autoRefresh)}
            >
              Auto-refresh {autoRefresh ? '5 s' : 'off'}
            </Button>
            <Button
              variant="ghost"
              size="icon-lg"
              aria-label="Forget the admin secret"
              title="Forget the admin secret"
              onClick={onLock}
            >
              <LockKeyhole aria-hidden />
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 space-y-6 px-4 py-8 sm:px-6">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        )}
        {children}
      </main>
      <footer className="border-t">
        <div className="mx-auto flex max-w-7xl flex-wrap justify-between gap-2 px-4 py-5 text-xs text-muted-foreground sm:px-6">
          <span>
            PremiumPass admin console · local only · one shared admin secret
          </span>
          <span>
            {state
              ? `${state.table} · ${state.recordCount} records`
              : 'DynamoDB Local'}{' '}
            · ElasticMQ · Stripe test mode · synthetic data
          </span>
        </div>
      </footer>
    </div>
  );
}
