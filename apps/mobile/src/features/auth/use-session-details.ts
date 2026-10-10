import { useEffect, useState } from 'react';
import { useAuth0, type Credentials } from 'react-native-auth0';

type SessionDetails = Pick<
  Credentials,
  | 'accessToken'
  | 'idToken'
  | 'tokenType'
  | 'expiresAt'
  | 'sessionExpiresAt'
  | 'scope'
> & { hasRefreshToken: boolean };
type SessionState =
  | { status: 'loading' }
  | { status: 'success'; credentials: SessionDetails }
  | { status: 'error'; message: string };

// A temporary display snapshot, never a token cache used for requests.
// The owning panel unmounts when closed, backgrounded, or signed out.
export function useSessionDetails() {
  const { getCredentials } = useAuth0();
  const [state, setState] = useState<SessionState>({ status: 'loading' });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setState({ status: 'loading' });
    void getCredentials()
      .then((credentials) => {
        if (!active) return;
        setState({
          status: 'success',
          credentials: {
            accessToken: credentials.accessToken,
            idToken: credentials.idToken,
            tokenType: credentials.tokenType,
            expiresAt: credentials.expiresAt,
            ...(credentials.sessionExpiresAt !== undefined
              ? { sessionExpiresAt: credentials.sessionExpiresAt }
              : {}),
            ...(credentials.scope !== undefined
              ? { scope: credentials.scope }
              : {}),
            hasRefreshToken: Boolean(credentials.refreshToken),
          },
        });
      })
      .catch(() => {
        if (active)
          setState({
            status: 'error',
            message:
              'Unable to read session details. Sign out and sign in again if your session has expired.',
          });
      });
    return () => {
      active = false;
    };
  }, [getCredentials, revision]);
  return { state, reload: () => setRevision((value) => value + 1) };
}
