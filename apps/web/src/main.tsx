import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Auth0Provider } from '@auth0/auth0-react';
import { readWebConfig } from './config';
import { App } from './App';
import { SetupPage } from './components/status-pages';
import {
  redirectCheckoutReturn,
  replaceRoute,
  toAppRoute,
} from './lib/navigation';
import './style.css';

function Root() {
  let config;
  try {
    config = readWebConfig();
  } catch (error) {
    return (
      <SetupPage
        message={
          error instanceof Error
            ? error.message
            : 'Configure the web demo first.'
        }
      />
    );
  }

  return (
    <Auth0Provider
      domain={config.domain}
      clientId={config.clientId}
      authorizationParams={{
        audience: config.audience,
        redirect_uri: window.location.origin,
        // read:premium lets the client ask for the score history. The API still
        // requires a valid Premium grant; the scope alone unlocks nothing.
        scope: 'openid profile email read:me read:premium write:checkout',
      }}
      // Let the SDK restore valid tokens after reloads and checkout redirects.
      cacheLocation="localstorage"
      useRefreshTokens={false}
      // Drop the Auth0 code and state from the URL and reopen the page the
      // user started from. Only known routes are accepted.
      onRedirectCallback={(appState) =>
        replaceRoute(toAppRoute(appState?.returnTo))
      }
    >
      <App />
    </Auth0Provider>
  );
}

redirectCheckoutReturn();

const root = document.getElementById('root');
if (!root) {
  throw new Error('Missing application root.');
}

createRoot(root).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
