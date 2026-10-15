import { useEffect, useState } from 'react';
import { AppState, View } from 'react-native';
import { useAuth0 } from 'react-native-auth0';
import { Card } from '../../components/ui/card';
import { Text } from '../../components/ui/text';
import { Button, ButtonText } from '../../components/ui/button';
import { Spinner } from '../../components/ui/spinner';
import { ErrorMessage } from '../../components/ErrorMessage';
import { formatSessionTime, inspectJwt } from './session-details';
import { useSessionDetails } from './use-session-details';

function JsonDetails({ label, value }: { label: string; value: unknown }) {
  return (
    <View className="gap-2">
      <Text className="font-bold text-foreground">{label}</Text>
      <Text
        selectable
        className="rounded-lg bg-background p-3 font-mono text-xs text-foreground"
      >
        {JSON.stringify(value, null, 2)}
      </Text>
    </View>
  );
}

function TokenDetails({ label, token }: { label: string; token: string }) {
  const [expanded, setExpanded] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const decoded = inspectJwt(token);
  return (
    <View className="gap-3">
      <Button
        variant="outline"
        onPress={() => {
          setExpanded(!expanded);
          setShowRaw(false);
        }}
      >
        <ButtonText>
          {expanded ? 'Hide' : 'Show'} {label}
        </ButtonText>
      </Button>
      {expanded && (
        <>
          {decoded ? (
            <>
              <JsonDetails label="JWT header" value={decoded.header} />
              <JsonDetails label="JWT claims" value={decoded.claims} />
            </>
          ) : (
            <Text className="text-muted-foreground">
              This token is opaque or cannot be decoded as a JWT.
            </Text>
          )}
          <Button variant="outline" onPress={() => setShowRaw(!showRaw)}>
            <ButtonText>
              {showRaw ? 'Hide' : 'Show'} raw {label}
            </ButtonText>
          </Button>
          {showRaw && (
            <Text
              selectable
              className="rounded-lg bg-background p-3 font-mono text-xs text-foreground"
            >
              {token || 'Not provided'}
            </Text>
          )}
        </>
      )}
    </View>
  );
}

function SessionDetailsPanel() {
  const { user } = useAuth0();
  const { state, reload } = useSessionDetails();
  return (
    <View className="gap-4">
      <JsonDetails label="OIDC profile (Auth0 SDK)" value={user} />
      {state.status === 'loading' && (
        <Spinner accessibilityLabel="Loading session details" />
      )}
      <ErrorMessage message={state.status === 'error' ? state.message : null} />
      {state.status === 'success' && (
        <>
          <JsonDetails
            label="Session metadata"
            value={{
              tokenType: state.credentials.tokenType,
              scope: state.credentials.scope ?? 'Not provided',
              accessTokenExpiresAt: formatSessionTime(
                state.credentials.expiresAt,
              ),
              sessionExpiresAt: formatSessionTime(
                state.credentials.sessionExpiresAt,
              ),
              refreshTokenAvailable: state.credentials.hasRefreshToken,
            }}
          />
          <Text className="text-sm text-muted-foreground">
            Access tokens are used for API requests. ID tokens describe your
            sign-in identity. Claims below are decoded for inspection; the
            backend verifies API tokens.
          </Text>
          <TokenDetails
            label="access token"
            token={state.credentials.accessToken}
          />
          <TokenDetails label="ID token" token={state.credentials.idToken} />
        </>
      )}
      <Button
        variant="outline"
        isDisabled={state.status === 'loading'}
        onPress={reload}
      >
        <ButtonText>Reload session details</ButtonText>
      </Button>
    </View>
  );
}

export function SessionCard() {
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        setExpanded(false);
      }
    });
    return () => subscription.remove();
  }, []);
  return (
    <Card className="gap-4 rounded-2xl p-6">
      <Text className="text-base font-semibold text-foreground">
        Auth0 session
      </Text>
      <Button variant="outline" onPress={() => setExpanded(!expanded)}>
        <ButtonText>
          {expanded ? 'Hide session details' : 'Show session details'}
        </ButtonText>
      </Button>
      {expanded && <SessionDetailsPanel />}
    </Card>
  );
}
