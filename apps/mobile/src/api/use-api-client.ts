import { useMemo } from 'react';
import { useAuth0 } from 'react-native-auth0';
import { ApiClient } from './api-client';
import { readMobileConfig } from '../app/config';

export function useApiClient(): ApiClient {
  const { apiUrl } = readMobileConfig();
  const { getCredentials } = useAuth0();
  return useMemo(
    () =>
      new ApiClient(apiUrl, async () => {
        // Read current SDK credentials for each request; never cache a token here.
        const credentials = await getCredentials();
        return credentials.accessToken;
      }),
    [apiUrl, getCredentials],
  );
}
