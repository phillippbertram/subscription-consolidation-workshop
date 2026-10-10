import { useMemo } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { ApiClient } from '../api-client';
import { readWebConfig } from '../config';

export function useApiClient() {
  const { getAccessTokenSilently } = useAuth0();
  return useMemo(
    () =>
      new ApiClient(readWebConfig().apiUrl, async () => {
        const token = await getAccessTokenSilently();
        if (!token) throw new Error('Sign in again to obtain an access token.');
        return token;
      }),
    [getAccessTokenSilently],
  );
}
