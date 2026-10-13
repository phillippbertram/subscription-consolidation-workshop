import type { ExpoConfig } from 'expo/config';

const iosBundleIdentifier: unknown = process.env.IOS_BUNDLE_IDENTIFIER;

const config: ExpoConfig = {
  name: 'PremiumPass',
  slug: 'premiumpass',
  version: '0.1.0',
  scheme: 'premiumpass',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  ios: {
    bundleIdentifier:
      typeof iosBundleIdentifier === 'string'
        ? iosBundleIdentifier
        : 'com.example.premiumpass',
    supportsTablet: false,
    infoPlist: {
      // The local learning app connects to the BFF on this Mac.
      NSLocalNetworkUsageDescription:
        'PremiumPass connects to the development server and local API on your Mac.',
      NSAppTransportSecurity: {
        NSAllowsLocalNetworking: true,
        // iOS 17+ supports IP/CIDR exceptions for local HTTP development.
        NSExceptionDomains: {
          '127.0.0.1': { NSExceptionAllowsInsecureHTTPLoads: true },
          '10.0.0.0/8': { NSExceptionAllowsInsecureHTTPLoads: true },
          '172.16.0.0/12': { NSExceptionAllowsInsecureHTTPLoads: true },
          '192.168.0.0/16': { NSExceptionAllowsInsecureHTTPLoads: true },
        },
      },
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
