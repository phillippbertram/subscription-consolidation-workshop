import type { ExpoConfig } from 'expo/config';
import {
  AndroidConfig,
  withAndroidManifest,
  withAppBuildGradle,
  type ConfigPlugin,
} from 'expo/config-plugins';

const marker = '// PremiumPass upload signing';

// Expo's development template signs release builds with the debug key. An
// internal Play release must instead use the developer's dedicated upload key.
const withAndroidUploadSigning: ConfigPlugin = (config) =>
  withAndroidManifest(
    withAppBuildGradle(config, (mod) => {
      if (mod.modResults.language !== 'groovy') {
        throw new Error(
          'PremiumPass Android signing expects the Expo Groovy template.',
        );
      }

      let contents = mod.modResults.contents.split(marker)[0]!;
      contents = contents.replace(
        /(release\s*\{[\s\S]*?)signingConfig\s*(?:=\s*)?signingConfigs\.debug/,
        '$1signingConfig = null',
      );
      if (/release\s*\{[^}]*signingConfigs\.debug/.test(contents)) {
        throw new Error('Release signing must not use the Android debug key.');
      }

      mod.modResults.contents = `${contents.trimEnd()}

${marker}
def premiumPassUnsigned = System.getenv("PREMIUMPASS_UNSIGNED_ANDROID") == "true"
def premiumPassRelease = gradle.startParameter.taskNames.any { it.toLowerCase().contains("release") }
if (premiumPassRelease && !premiumPassUnsigned) {
    def uploadFile = System.getenv("ANDROID_UPLOAD_KEYSTORE_FILE")
    def uploadStorePassword = System.getenv("ANDROID_UPLOAD_KEYSTORE_PASSWORD")
    def uploadAlias = System.getenv("ANDROID_UPLOAD_KEY_ALIAS")
    def uploadKeyPassword = System.getenv("ANDROID_UPLOAD_KEY_PASSWORD")
    if (!uploadFile || !uploadStorePassword || !uploadAlias || !uploadKeyPassword || !new File(uploadFile).isFile()) {
        throw new GradleException("Set the four ANDROID_UPLOAD_KEY* settings before building a signed release.")
    }
    android.signingConfigs.create("premiumPassUpload") {
        storeFile new File(uploadFile)
        storePassword uploadStorePassword
        keyAlias uploadAlias
        keyPassword uploadKeyPassword
    }
    android.buildTypes.release.signingConfig = android.signingConfigs.premiumPassUpload
}
`;
      return mod;
    }),
    (mod) => {
      AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults).$[
        'android:usesCleartextTraffic'
      ] = 'true';
      return mod;
    },
  );

const iosBundleIdentifier: unknown = process.env.IOS_BUNDLE_IDENTIFIER;
const rawAndroidPackageName: unknown = process.env.ANDROID_PACKAGE_NAME;
const androidPackageName =
  typeof rawAndroidPackageName === 'string'
    ? rawAndroidPackageName
    : 'com.example.premiumpass';
const androidVersionCode = Number(process.env.ANDROID_VERSION_CODE ?? '1');
if (
  !/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/.test(androidPackageName) ||
  !Number.isSafeInteger(androidVersionCode) ||
  androidVersionCode < 1 ||
  androidVersionCode > 2100000000
) {
  throw new Error(
    'Use a valid ANDROID_PACKAGE_NAME and positive ANDROID_VERSION_CODE.',
  );
}

const config: ExpoConfig = {
  name: 'PremiumPass',
  slug: 'premiumpass',
  version: '0.1.0',
  scheme: 'premiumpass',
  orientation: 'portrait',
  userInterfaceStyle: 'dark',
  ios: {
    bundleIdentifier:
      typeof iosBundleIdentifier === 'string'
        ? iosBundleIdentifier
        : 'com.example.premiumpass',
    supportsTablet: false,
    infoPlist: {
      // The local learning app connects to the API on this Mac.
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
  android: {
    package: androidPackageName,
    versionCode: androidVersionCode,
    // Local HTTP API access is intentional for this demo; do not reuse this
    // setting for a production distribution without an HTTPS/network policy.
  },
  plugins: [
    'expo-dev-client',
    ['expo-iap', { android: { store: 'play' } }],
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

export default withAndroidUploadSigning(config);
