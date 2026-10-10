import { ActivityIndicator } from 'react-native';
import { Screen } from '../components/Screen';
import { LoginScreen } from '../features/auth/LoginScreen';
import { useAuthSession } from '../features/auth/use-auth-session';
import { ProfileScreen } from '../features/profile/ProfileScreen';
import type { MobileConfig } from './config';

export function AppContent({ config }: { config: MobileConfig }) {
  // One hook instance owns action state across the login/profile transition.
  const session = useAuthSession(config.audience);
  if (session.isLoading) {
    return (
      <Screen
        title="Restoring your session"
        description="Checking your saved sign-in credentials."
      >
        <ActivityIndicator accessibilityLabel="Restoring session" />
      </Screen>
    );
  }
  if (!session.user) {
    return (
      <LoginScreen
        isBusy={session.isBusy}
        error={session.error}
        onSignIn={session.signIn}
      />
    );
  }
  return (
    <ProfileScreen
      key={`${config.domain}:${session.user.sub}`}
      isSigningOut={session.isBusy}
      authError={session.error}
      onSignOut={session.signOut}
    />
  );
}
