import { Button, ButtonText, ButtonSpinner } from '../../components/ui/button';
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
        size="lg"
        className="min-h-12 rounded-xl"
        isDisabled={isBusy}
        onPress={() => {
          void onSignIn();
        }}
      >
        {isBusy && (
          <ButtonSpinner color="white" accessibilityLabel="Signing in" />
        )}
        <ButtonText>Sign in with Auth0</ButtonText>
      </Button>
    </Screen>
  );
}
