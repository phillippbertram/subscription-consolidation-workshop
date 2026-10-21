import * as Application from 'expo-application';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { authScheme } from '../auth/auth-scheme';

export interface DeviceInfoEntry {
  label: string;
  value: string;
}

const unknown = 'unknown';

/**
 * Facts that explain most "works on my phone" problems in a workshop: which
 * build is installed, which OS runs it, and which addresses it talks to.
 *
 * The app identifiers come from the installed native app, not from
 * app.config.ts. They show what actually runs, even if the config changed after
 * the last native build. None of these values identifies the user.
 */
export function readDeviceInfo(settings: {
  apiUrl: string;
  domain: string;
}): DeviceInfoEntry[] {
  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  const applicationId = Application.applicationId ?? unknown;
  const reactNative = Platform.constants.reactNativeVersion;
  const osName = Device.osName ?? (platform === 'ios' ? 'iOS' : 'Android');
  // Android also reports the API level, which Play and libraries document.
  const apiLevel = Device.platformApiLevel
    ? ` (API ${Device.platformApiLevel})`
    : '';
  const deviceName = [Device.manufacturer, Device.modelName]
    .filter(Boolean)
    .join(' ');

  return [
    {
      label: platform === 'ios' ? 'Bundle ID' : 'Package name',
      value: applicationId,
    },
    {
      label: 'App version',
      value: `${Application.nativeApplicationVersion ?? unknown} (${Application.nativeBuildVersion ?? unknown})`,
    },
    { label: 'Build', value: __DEV__ ? 'Development (Metro)' : 'Release' },
    {
      label: 'OS',
      value: `${osName} ${Device.osVersion ?? unknown}${apiLevel}`,
    },
    { label: 'Device', value: deviceName || unknown },
    {
      label: 'Physical device',
      value: Device.isDevice ? 'Yes' : 'No (emulator or simulator)',
    },
    {
      label: 'React Native',
      value: `${reactNative.major}.${reactNative.minor}.${reactNative.patch}`,
    },
    { label: 'API URL', value: settings.apiUrl },
    // The format is documented in docs/setup/auth0.md, with the application ID
    // in lowercase. If sign-in reports a callback mismatch, this exact URL must
    // be in Auth0's Allowed Callback URLs and Allowed Logout URLs.
    {
      label: 'Expected Auth0 callback URL',
      value: `${authScheme}://${settings.domain}/${platform}/${applicationId.toLowerCase()}/callback`,
    },
  ];
}
