import type { ReactNode } from 'react';
import { Platform, View } from 'react-native';
import type { SubscriptionOverview } from '@premiumpass/api-contracts';
import { Text } from '../../../components/ui/text';
import { Button, ButtonText } from '../../../components/ui/button';
import { ErrorMessage } from '../../../components/ErrorMessage';
import { useGooglePurchase } from './use-google-purchase';

interface Props {
  overview: SubscriptionOverview | null;
  onVerified: () => void;
  children: (content: {
    actions: ReactNode;
    sandboxControl: ReactNode;
  }) => ReactNode;
}

export function GoogleSubscriptionActions(props: Props) {
  return Platform.OS === 'android' ? (
    <GoogleStoreActions {...props} />
  ) : (
    props.children({ actions: null, sandboxControl: null })
  );
}

/** Buttons and messages only; the purchase flow lives in useGooglePurchase. */
function GoogleStoreActions({ overview, onVerified, children }: Props) {
  const google = useGooglePurchase({ overview, onVerified });
  const { connected, config, offer, busy } = google;

  return children({
    sandboxControl: null,
    actions: (
      <View className="gap-2">
        <Text className="text-muted-foreground">
          Monthly subscription · Google Play license test
        </Text>
        {google.offerPurchase && (
          <Button
            isDisabled={!connected || !config || !offer || busy}
            onPress={() => {
              void google.buy();
            }}
          >
            <ButtonText>
              {busy
                ? 'Processing…'
                : offer
                  ? `Subscribe · ${offer.displayPrice} / month`
                  : 'Waiting for the Google Play base plan…'}
            </ButtonText>
          </Button>
        )}
        {google.canManage && (
          <Button
            variant="outline"
            isDisabled={!config || busy}
            onPress={() => {
              void google.manage();
            }}
          >
            <ButtonText>Manage Google Play subscription</ButtonText>
          </Button>
        )}
        <Button
          variant="ghost"
          isDisabled={!connected || !config || busy}
          onPress={() => {
            void google.restore();
          }}
        >
          <ButtonText>Restore Google Play purchases</ButtonText>
        </Button>
        {google.message && (
          <Text className="text-muted-foreground">{google.message}</Text>
        )}
        <ErrorMessage message={google.error} />
      </View>
    ),
  });
}
