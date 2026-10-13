import { useState } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { DemoLayout } from './components/demo-layout';
import { useCheckout } from './hooks/use-checkout';
import { useAccount } from './hooks/use-account';

export function App() {
  const auth = useAuth0();
  // A new identity remounts account and checkout state; late requests cannot leak across sessions.
  return <AccountApp key={`${auth.isAuthenticated}:${auth.user?.sub ?? ''}`} />;
}

function AccountApp() {
  const auth = useAuth0();
  const account = useAccount(auth.isAuthenticated && !auth.isLoading);
  const profile =
    account.state.status === 'success' ? account.state.profile : undefined;
  const checkout = useCheckout(profile?.userId);
  const [authMessage, setAuthMessage] = useState('');
  return (
    <DemoLayout
      signedIn={auth.isAuthenticated}
      loading={auth.isLoading}
      userId={profile?.userId}
      profile={profile}
      identity={{
        name: auth.user?.name,
        email: auth.user?.email,
        emailVerified: auth.user?.email_verified,
        subject: auth.user?.sub,
      }}
      accountState={account.state}
      onRefresh={account.reload}
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
