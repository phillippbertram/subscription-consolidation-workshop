import { useState } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { DemoLayout } from './components/demo-layout';
import { useCheckout } from './hooks/use-checkout';

export function App() {
  const auth = useAuth0();
  const checkout = useCheckout();
  const [authMessage, setAuthMessage] = useState('');
  return (
    <DemoLayout
      signedIn={auth.isAuthenticated}
      loading={auth.isLoading}
      userId={checkout.userId}
      pending={checkout.pending}
      expired={checkout.expired}
      message={
        auth.error
          ? 'Unable to restore your Auth0 session. Check the SPA settings and sign in again.'
          : authMessage || checkout.message
      }
      onLogin={() => {
        void auth
          .loginWithRedirect()
          .catch(() =>
            setAuthMessage(
              'Unable to start Auth0 login. Check the SPA configuration.',
            ),
          );
      }}
      onLogout={() => {
        void auth
          .logout({ logoutParams: { returnTo: window.location.origin } })
          .catch(() => setAuthMessage('Unable to sign out. Please retry.'));
      }}
      onCheckout={() => {
        void checkout.checkout();
      }}
      onNewAttempt={checkout.newAttempt}
    />
  );
}
