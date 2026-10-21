import { useEffect, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { useAuth0 } from 'react-native-auth0';
import { Text } from '../../components/ui/text';
import { Spinner } from '../../components/ui/spinner';
import { ErrorMessage } from '../../components/ErrorMessage';
import { Badge, Logo } from '../../components/Brand';
import { Icon, type IconName } from '../../components/Icon';
import { RefreshButton } from '../../components/RefreshButton';
import { StoreSubscriptionActions } from '../subscriptions/StoreSubscriptionActions';
import { BillingTab } from '../subscriptions/BillingTab';
import { SessionCard } from '../auth/SessionCard';
import { AccountTab } from '../profile/AccountTab';
import { Avatar, displayName } from '../profile/identity';
import { OverviewTab } from './OverviewTab';
import { useDashboard } from './use-dashboard';

type Tab = 'overview' | 'billing' | 'account';

const tabs: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'overview', label: 'Overview', icon: 'overview' },
  { id: 'billing', label: 'Billing', icon: 'billing' },
  { id: 'account', label: 'Account', icon: 'account' },
];

interface DashboardScreenProps {
  isSigningOut: boolean;
  authError: string | null;
  onSignOut: () => Promise<void>;
}

/**
 * The signed-in app: the website's Overview, Billing, and Account pages as
 * tabs. Three fixed tabs need no navigation library; a larger app would use
 * React Navigation for stacks, deep links, and native transitions.
 */
export function DashboardScreen({
  isSigningOut,
  authError,
  onSignOut,
}: DashboardScreenProps) {
  const { user } = useAuth0();
  const { state, reload, isRefreshing } = useDashboard(!isSigningOut);
  const [tab, setTab] = useState<Tab>('overview');
  const [pulled, setPulled] = useState(false);
  const scrollView = useRef<ScrollView>(null);
  const overview = state.status === 'success' ? state.overview : null;
  const profile = state.status === 'success' ? state.profile : null;
  const error = state.status === 'error' ? state.message : null;

  // Show the pull-to-refresh spinner only for a pull, not for focus refetches.
  useEffect(() => {
    if (!isRefreshing) {
      setPulled(false);
    }
  }, [isRefreshing]);

  function openTab(next: Tab) {
    setTab(next);
    scrollView.current?.scrollTo({ y: 0, animated: false });
  }

  const refreshButton = (
    <RefreshButton
      refreshing={isRefreshing}
      disabled={isSigningOut}
      onPress={reload}
    />
  );

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <View className="flex-row items-center justify-between gap-3 border-b border-border bg-background px-5 py-3">
        <Logo />
        <View className="flex-row items-center gap-3">
          {overview &&
            (overview.entitlements.tier === 'premium' ? (
              <Badge label="Premium" tone="default" icon="sparkles" />
            ) : (
              <Badge label="Free" />
            ))}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open account"
            onPress={() => openTab('account')}
          >
            <Avatar user={user} />
          </Pressable>
        </View>
      </View>
      {isSigningOut ? (
        <View className="flex-1 items-center justify-center gap-3">
          <Spinner accessibilityLabel="Signing out" />
          <Text className="text-muted-foreground">Signing out…</Text>
        </View>
      ) : (
        // Mounted for the whole session, independent of the visible tab: the
        // store hooks own purchase listeners and in-flight verification.
        <StoreSubscriptionActions overview={overview} onVerified={reload}>
          {({ actions, sandboxControl }) => (
            <ScrollView
              ref={scrollView}
              contentContainerStyle={{ flexGrow: 1 }}
              refreshControl={
                <RefreshControl
                  refreshing={pulled && isRefreshing}
                  onRefresh={() => {
                    setPulled(true);
                    reload();
                  }}
                />
              }
            >
              <View className="gap-5 px-5 py-6">
                {tab !== 'account' && <ErrorMessage message={authError} />}
                {tab === 'overview' && (
                  <OverviewTab
                    name={displayName(user)}
                    overview={overview}
                    error={error}
                    loading={state.status === 'loading'}
                    onReload={reload}
                    onOpenBilling={() => openTab('billing')}
                    refreshButton={refreshButton}
                  />
                )}
                {tab === 'billing' && (
                  <BillingTab
                    overview={overview}
                    error={error}
                    onReload={reload}
                    storeActions={actions}
                    refreshButton={refreshButton}
                  />
                )}
                {tab === 'account' && (
                  <AccountTab
                    profile={profile}
                    tier={overview?.entitlements.tier ?? null}
                    isSigningOut={isSigningOut}
                    authError={authError}
                    onSignOut={onSignOut}
                    onOpenBilling={() => openTab('billing')}
                    developerTools={
                      <>
                        {sandboxControl}
                        <SessionCard />
                      </>
                    }
                  />
                )}
                <Text className="text-center text-xs text-muted-foreground">
                  PremiumPass workshop demo · Test mode · Synthetic data
                </Text>
              </View>
            </ScrollView>
          )}
        </StoreSubscriptionActions>
      )}
      <TabBar active={tab} onChange={openTab} />
    </SafeAreaView>
  );
}

function TabBar({
  active,
  onChange,
}: {
  active: Tab;
  onChange: (tab: Tab) => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View
      accessibilityRole="tablist"
      className="flex-row border-t border-border bg-card px-2 pt-2"
      style={{ paddingBottom: Math.max(insets.bottom, 8) }}
    >
      {tabs.map((item) => {
        const selected = item.id === active;
        return (
          <Pressable
            key={item.id}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={item.label}
            className="flex-1 items-center gap-1 py-1"
            onPress={() => onChange(item.id)}
          >
            <View
              className={`rounded-full px-4 py-1 ${selected ? 'bg-secondary' : ''}`}
            >
              <Icon
                name={item.icon}
                size={20}
                color={selected ? 'primary' : 'muted-foreground'}
              />
            </View>
            <Text
              className={`text-xs ${selected ? 'font-semibold text-primary' : 'text-muted-foreground'}`}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
