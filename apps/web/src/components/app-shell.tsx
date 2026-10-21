import type { ReactNode } from 'react';
import { DropdownMenu } from 'radix-ui';
import {
  ChevronDown,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Sparkles,
  User,
} from 'lucide-react';
import type { AccountState } from '../features/account/use-account';
import {
  Avatar,
  displayName,
  type SessionProfile,
} from '../features/account/account-details';
import { AppLink, navigate, type AppRoute } from '../lib/navigation';
import { cn } from '../lib/utils';
import { Logo, TestModeBadge } from './brand';
import { Alert, AlertDescription } from './ui/alert';

const navItems: { route: AppRoute; label: string; icon: typeof User }[] = [
  { route: '/', label: 'Overview', icon: LayoutDashboard },
  { route: '/billing', label: 'Billing', icon: CreditCard },
  { route: '/account', label: 'Account', icon: User },
];

/** The signed-in frame: navigation, plan, and account menu around one page. */
export function AppShell({
  route,
  identity,
  state,
  message,
  onSignOut,
  children,
}: {
  route: AppRoute;
  identity: SessionProfile;
  state: AccountState;
  message: string;
  onSignOut: () => void;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <AppLink to="/" aria-label="PremiumPass overview">
            <Logo />
          </AppLink>
          <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
            {navItems.map((item) => (
              <NavLink
                key={item.route}
                item={item}
                active={route === item.route}
              />
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <TestModeBadge className="hidden sm:inline-flex" />
            <PlanBadge state={state} />
            <UserMenu identity={identity} onSignOut={onSignOut} />
          </div>
        </div>
        <nav
          className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 pb-2 md:hidden"
          aria-label="Main"
        >
          {navItems.map((item) => (
            <NavLink
              key={item.route}
              item={item}
              active={route === item.route}
            />
          ))}
        </nav>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-4 py-8 sm:px-6 sm:py-10">
        {message && (
          <Alert variant="destructive">
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        )}
        {children}
      </main>
      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-xs text-muted-foreground sm:px-6">
          <span>PremiumPass · Workshop demo</span>
          <span>Stripe test mode · Synthetic data only</span>
        </div>
      </footer>
    </div>
  );
}

function NavLink({
  item,
  active,
}: {
  item: (typeof navItems)[number];
  active: boolean;
}) {
  return (
    <AppLink
      to={item.route}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
        active && 'bg-muted text-foreground',
      )}
    >
      <item.icon className="size-4" aria-hidden />
      {item.label}
    </AppLink>
  );
}

function PlanBadge({ state }: { state: AccountState }) {
  if (state.status !== 'success') {
    return null;
  }

  return state.entitlements.tier === 'premium' ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-0.5 text-xs font-medium text-primary-foreground">
      <Sparkles className="size-3" aria-hidden />
      Premium
    </span>
  ) : (
    <AppLink
      to="/billing"
      className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground hover:bg-secondary/70"
    >
      Free · Upgrade
    </AppLink>
  );
}

function UserMenu({
  identity,
  onSignOut,
}: {
  identity: SessionProfile;
  onSignOut: () => void;
}) {
  const itemClass =
    'flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none data-highlighted:bg-muted';
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        className="flex items-center gap-1 rounded-full p-0.5 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
        aria-label="Open account menu"
      >
        <Avatar identity={identity} />
        <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-50 w-64 rounded-xl border bg-popover p-1.5 text-popover-foreground shadow-lg"
        >
          <DropdownMenu.Label className="px-2 py-2">
            <span className="block truncate text-sm font-medium">
              {displayName(identity) ?? 'Signed in'}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {identity.email}
            </span>
          </DropdownMenu.Label>
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          {navItems.map((item) => (
            <DropdownMenu.Item
              key={item.route}
              className={itemClass}
              onSelect={() => navigate(item.route)}
            >
              <item.icon className="size-4 text-muted-foreground" aria-hidden />
              {item.label}
            </DropdownMenu.Item>
          ))}
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          <DropdownMenu.Item className={itemClass} onSelect={onSignOut}>
            <LogOut className="size-4 text-muted-foreground" aria-hidden />
            Sign out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
