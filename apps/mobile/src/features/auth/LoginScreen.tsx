import { ActivityIndicator, Button } from 'react-native';
import { ErrorMessage } from '../../components/ErrorMessage';
import { Screen } from '../../components/Screen';

interface LoginScreenProps {
  isBusy: boolean;
  error: string | null;
  onSignIn: () => Promise<void>;
}

export function LoginScreen({ isBusy, error, onSignIn }: LoginScreenProps) {
  return (
    <Screen
      title="Welcome to PremiumPass"
      description="Sign in to create or retrieve your personal demo profile."
    >
      <ErrorMessage message={error} />
      <Button
        title="Sign in with Auth0"
        disabled={isBusy}
        onPress={() => {
          void onSignIn();
        }}
      />
      {isBusy && <ActivityIndicator accessibilityLabel="Signing in" />}
    </Screen>
  );
}
