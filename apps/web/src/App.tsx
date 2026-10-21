import { useState } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { useRoute, type AppRoute } from './lib/navigation';
import { AppShell } from './components/app-shell';
import { SessionLoading } from './components/status-pages';
import { LandingPage } from './features/landing/landing-page';
import { OverviewPage } from './features/overview/overview-page';
import { BillingPage } from './features/subscriptions/billing-page';
import { AccountPage } from './features/account/account-page';
import { useCheckout } from './features/subscriptions/use-checkout';
import { useAccount } from './features/account/use-account';

export function App() {
  const auth = useAuth0();
  // A new identity remounts account and checkout state; late requests cannot leak across sessions.
  return <AccountApp key={`${auth.isAuthenticated}:${auth.user?.sub ?? ''}`} />;
}

/**
 * Signed out, the website is a landing page. Signed in, the same URL shows the
 * account pages. Account and checkout state live here, above the pages, so
 * switching between Overview and Billing keeps an open checkout attempt.
 */
function AccountApp() {
  const auth = useAuth0();
  const route = useRoute();
  const account = useAccount(auth.isAuthenticated && !auth.isLoading);
  const profile =
    account.state.status === 'success' ? account.state.profile : undefined;
  const checkout = useCheckout(profile?.userId);
  const [authMessage, setAuthMessage] = useState('');
  const message = auth.error
    ? 'Unable to restore your Auth0 session. Check the SPA settings and sign in again.'
    : authMessage;

  function signIn(returnTo: AppRoute = route) {
    // Auth0 always redirects to the origin; appState carries the page to reopen.
    void auth
      .loginWithRedirect({ appState: { returnTo } })
      .catch(() =>
        setAuthMessage(
          'Unable to start Auth0 login. Check the SPA configuration.',
        ),
      );
  }

  function signOut() {
    void auth
      .logout({ logoutParams: { returnTo: window.location.origin } })
      .catch(() => setAuthMessage('Unable to sign out. Please retry.'));
  }

  if (auth.isLoading) {
    return <SessionLoading />;
  }

  if (!auth.isAuthenticated) {
    return <LandingPage message={message} onSignIn={signIn} />;
  }

  const identity = {
    name: auth.user?.name,
    email: auth.user?.email,
    emailVerified: auth.user?.email_verified,
    subject: auth.user?.sub,
  };
  return (
    <AppShell
      route={route}
      identity={identity}
      state={account.state}
      message={message}
      onSignOut={signOut}
    >
      {route === '/' && (
        <OverviewPage
          identity={identity}
          state={account.state}
          onRefresh={account.reload}
        />
      )}
      {route === '/billing' && (
        <BillingPage
          state={account.state}
          onRefresh={account.reload}
          checkout={checkout}
          userId={profile?.userId}
        />
      )}
      {route === '/account' && (
        <AccountPage
          identity={identity}
          profile={profile}
          state={account.state}
          onSignOut={signOut}
        />
      )}
    </AppShell>
  );
}
