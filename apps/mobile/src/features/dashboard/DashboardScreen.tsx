import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../components/ui/button';
import { Text } from '../../components/ui/text';
import { Spinner } from '../../components/ui/spinner';
import { ErrorMessage } from '../../components/ErrorMessage';
import { SubscriptionCard } from '../subscriptions/SubscriptionCard';
import { ScoreHistoryCard } from '../scores/ScoreHistoryCard';
import { SessionCard } from '../auth/SessionCard';
import { ProfileCard } from '../profile/ProfileCard';
import { AccountPanel } from '../profile/AccountPanel';
import { DashboardIcon } from '../../components/DashboardIcon';
import { useDashboard } from './use-dashboard';

interface DashboardScreenProps {
  isSigningOut: boolean;
  authError: string | null;
  onSignOut: () => Promise<void>;
}

export function DashboardScreen({
  isSigningOut,
  authError,
  onSignOut,
}: DashboardScreenProps) {
  const { state, reload } = useDashboard(!isSigningOut);
  const [accountOpen, setAccountOpen] = useState(false);
  const overview = state.status === 'success' ? state.overview : null;
  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <View className="gap-5 p-6">
          <View className="flex-row items-center justify-between gap-4">
            <Text className="text-lg font-semibold text-foreground">
              PremiumPass
            </Text>
            <Button
              variant="outline"
              size="icon"
              className="h-11 w-11 rounded-full bg-card"
              accessibilityLabel="Open account"
              onPress={() => setAccountOpen(true)}
            >
              <DashboardIcon name="account" />
            </Button>
          </View>
          <View className="flex-row items-center justify-between gap-4">
            <View className="flex-1 gap-1">
              <Text
                accessibilityRole="header"
                className="text-3xl font-semibold text-foreground"
              >
                Overview
              </Text>
              <Text className="text-sm text-muted-foreground">
                Your score. Your membership.
              </Text>
            </View>
            <Button
              variant="outline"
              size="icon"
              className="h-11 w-11 rounded-full bg-card"
              isDisabled={isSigningOut || state.status === 'loading'}
              accessibilityLabel="Refresh dashboard"
              onPress={reload}
            >
              {state.status === 'loading' ? (
                <Spinner accessibilityLabel="Refreshing dashboard" />
              ) : (
                <DashboardIcon name="refresh" />
              )}
            </Button>
          </View>
          {!isSigningOut && (
            <>
              <ScoreHistoryCard
                hasAccess={
                  overview ? overview.entitlements.tier === 'premium' : null
                }
                loading={state.status === 'loading'}
              />
              <SubscriptionCard
                overview={overview}
                error={state.status === 'error' ? state.message : null}
                onReload={reload}
                developerDetails={
                  <>
                    <SessionCard />
                    {state.status === 'success' && (
                      <ProfileCard profile={state.profile} />
                    )}
                  </>
                }
              />
            </>
          )}
          {isSigningOut && <Spinner accessibilityLabel="Signing out" />}
          {!accountOpen && <ErrorMessage message={authError} />}
          <Text className="text-center text-xs text-muted-foreground">
            Learning demo · Synthetic score data
          </Text>
        </View>
      </ScrollView>
      <AccountPanel
        visible={accountOpen}
        isSigningOut={isSigningOut}
        error={authError}
        onClose={() => setAccountOpen(false)}
        onSignOut={onSignOut}
      />
    </SafeAreaView>
  );
}
