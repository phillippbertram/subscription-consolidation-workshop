import { Button, ButtonText } from '../../components/ui/button';
import { Spinner } from '../../components/ui/spinner';
import { Screen } from '../../components/Screen';
import { ErrorMessage } from '../../components/ErrorMessage';
import { ProfileCard } from './ProfileCard';
import { useProfile } from './use-profile';

interface ProfileScreenProps {
  isSigningOut: boolean;
  authError: string | null;
  onSignOut: () => Promise<void>;
}

export function ProfileScreen({
  isSigningOut,
  authError,
  onSignOut,
}: ProfileScreenProps) {
  const { state, reload } = useProfile(!isSigningOut);
  return (
    <Screen
      title="Your profile"
      description="Your profile is loaded from the backend using your Auth0 session."
    >
      {state.status === 'success' && <ProfileCard profile={state.profile} />}
      {state.status === 'loading' && (
        <Spinner
          className="text-primary"
          accessibilityLabel="Loading profile"
        />
      )}
      <ErrorMessage message={state.status === 'error' ? state.message : null} />
      <Button
        size="lg"
        className="min-h-12 rounded-xl"
        isDisabled={isSigningOut || state.status === 'loading'}
        onPress={reload}
      >
        <ButtonText>Reload profile</ButtonText>
      </Button>
      <ErrorMessage message={authError} />
      <Button
        size="lg"
        variant="outline"
        className="min-h-12 rounded-xl"
        isDisabled={isSigningOut}
        onPress={() => {
          void onSignOut();
        }}
      >
        <ButtonText>Sign out</ButtonText>
      </Button>
      {isSigningOut && (
        <Spinner className="text-primary" accessibilityLabel="Signing out" />
      )}
    </Screen>
  );
}
