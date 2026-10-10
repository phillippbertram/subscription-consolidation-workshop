import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'PremiumPass',
  slug: 'premiumpass',
  version: '0.1.0',
  scheme: 'premiumpass',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  ios: {
    bundleIdentifier: 'com.example.premiumpass',
    supportsTablet: false,
    infoPlist: {
      // The local learning app connects to the BFF on this Mac.
      NSAppTransportSecurity: { NSAllowsLocalNetworking: true },
    },
  },
  android: { package: 'com.example.premiumpass' },
  plugins: [
    'expo-dev-client',
    [
      'react-native-auth0',
      {
        domain:
          process.env.EXPO_PUBLIC_AUTH0_DOMAIN ?? 'your-tenant.eu.auth0.com',
        customScheme: 'premiumpass',
      },
    ],
  ],
};

export default config;
