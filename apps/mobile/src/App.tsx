import { Auth0Provider } from 'react-native-auth0';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppContent } from './app/AppContent';
import { readMobileConfig, type MobileConfig } from './app/config';
import { Screen } from './components/Screen';
import { GluestackUIProvider } from './components/ui/gluestack-ui-provider';

export default function App() {
  return (
    <SafeAreaProvider>
      <GluestackUIProvider>
        <ConfiguredApp />
      </GluestackUIProvider>
    </SafeAreaProvider>
  );
}

function ConfiguredApp() {
  let config: MobileConfig;
  try {
    config = readMobileConfig();
  } catch {
    return (
      <Screen
        title="Setup required"
        description="Set the public Auth0 domain, Native Client ID, API audience, and API URL in apps/mobile/.env. Reload the app after saving. Rebuild the iOS app if the Auth0 domain changes."
      />
    );
  }

  return (
    <Auth0Provider domain={config.domain} clientId={config.clientId}>
      <AppContent config={config} />
    </Auth0Provider>
  );
}
