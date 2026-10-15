import { Spinner } from '../components/ui/spinner';
import { Screen } from '../components/Screen';
import { LoginScreen } from '../features/auth/LoginScreen';
import { useAuthSession } from '../features/auth/use-auth-session';
import { DashboardScreen } from '../features/dashboard/DashboardScreen';
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
        <Spinner
          className="text-primary"
          accessibilityLabel="Restoring session"
        />
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
    <DashboardScreen
      key={`${config.domain}:${session.user.sub}`}
      isSigningOut={session.isBusy}
      authError={session.error}
      onSignOut={session.signOut}
    />
  );
}
