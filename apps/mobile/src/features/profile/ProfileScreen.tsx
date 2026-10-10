import { ActivityIndicator, Button } from 'react-native';
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
        <ActivityIndicator accessibilityLabel="Loading profile" />
      )}
      <ErrorMessage message={state.status === 'error' ? state.message : null} />
      <Button
        title="Reload profile"
        disabled={isSigningOut || state.status === 'loading'}
        onPress={reload}
      />
      <ErrorMessage message={authError} />
      <Button
        title="Sign out"
        disabled={isSigningOut}
        onPress={() => {
          void onSignOut();
        }}
      />
      {isSigningOut && <ActivityIndicator accessibilityLabel="Signing out" />}
    </Screen>
  );
}
