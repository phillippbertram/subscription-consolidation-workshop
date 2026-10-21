import { useState } from 'react';
import { useAuth0 } from 'react-native-auth0';
import { authErrorMessage } from './auth-errors';
import { authScheme } from './auth-scheme';

export function useAuthSession(audience: string) {
  const { authorize, clearSession, user, isLoading } = useAuth0();
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setError(null);
    setIsBusy(true);
    try {
      await authorize(
        {
          audience,
          scope: 'openid profile email read:me read:premium write:checkout',
          additionalParameters: { prompt: 'login' },
        },
        { customScheme: authScheme },
      );
    } catch (cause) {
      setError(authErrorMessage(cause, 'Sign-in'));
    } finally {
      setIsBusy(false);
    }
  }

  async function signOut() {
    setError(null);
    setIsBusy(true);
    try {
      // The SDK clears its browser session and secure credentials on success.
      await clearSession({}, { customScheme: authScheme });
    } catch (cause) {
      setError(authErrorMessage(cause, 'Sign-out'));
    } finally {
      setIsBusy(false);
    }
  }

  return { user, isLoading, isBusy, error, signIn, signOut };
}
