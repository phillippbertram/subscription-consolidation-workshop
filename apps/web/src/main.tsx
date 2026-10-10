import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Auth0Provider } from '@auth0/auth0-react';
import { readWebConfig } from './config';
import { App } from './App';
import { DemoLayout } from './components/demo-layout';
import './style.css';

function Root() {
  let config;
  try {
    config = readWebConfig();
  } catch (error) {
    return (
      <DemoLayout
        setupMessage={
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
        scope: 'openid profile email read:me write:checkout',
      }}
      // Let the SDK restore valid tokens after reloads and checkout redirects.
      cacheLocation="localstorage"
      useRefreshTokens={false}
      onRedirectCallback={() =>
        window.history.replaceState({}, document.title, window.location.origin)
      }
    >
      <App />
    </Auth0Provider>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('Missing application root.');
createRoot(root).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
