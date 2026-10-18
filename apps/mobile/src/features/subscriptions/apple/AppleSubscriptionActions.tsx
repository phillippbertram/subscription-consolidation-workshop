import type { ReactNode } from 'react';
import { Platform, Switch, View } from 'react-native';
import type { SubscriptionOverview } from '@premiumpass/api-contracts';
import { Text } from '../../../components/ui/text';
import { Button, ButtonText } from '../../../components/ui/button';
import { ErrorMessage } from '../../../components/ErrorMessage';
import { useApplePurchase } from './use-apple-purchase';

interface AppleSubscriptionActionsProps {
  overview: SubscriptionOverview | null;
  onVerified: () => void;
  children: (content: {
    actions: ReactNode;
    sandboxControl: ReactNode;
  }) => ReactNode;
}

export function AppleSubscriptionActions(props: AppleSubscriptionActionsProps) {
  return Platform.OS === 'ios' ? (
    <AppleStoreCard {...props} />
  ) : (
    props.children({ actions: null, sandboxControl: null })
  );
}

/** Buttons and messages only; the purchase flow lives in useApplePurchase. */
function AppleStoreCard({
  overview,
  onVerified,
  children,
}: AppleSubscriptionActionsProps) {
  const apple = useApplePurchase({ overview, onVerified });
  const { connected, config, product, isBusy, sandboxOverride } = apple;

  const purchaseOffer = apple.offerPurchase && (
    <>
      <Text className="text-muted-foreground">
        Monthly subscription · Apple Sandbox
      </Text>
      {connected && config && !product && (
        <Text className="text-muted-foreground">
          The product is not available yet. Check its price, localization, and
          sandbox availability.
        </Text>
      )}
      <Button
        isDisabled={!connected || !config || !product || isBusy}
        onPress={() => {
          void apple.buy();
        }}
      >
        <ButtonText>
          {isBusy
            ? 'Processing…'
            : product
              ? `${sandboxOverride ? 'Test purchase' : 'Subscribe'} · ${product.displayPrice} / month`
              : 'Connecting to Apple…'}
        </ButtonText>
      </Button>
    </>
  );
  const actions = (
    <View className="gap-1">
      {!sandboxOverride && purchaseOffer}
      {apple.canManage && (
        <Button
          variant="outline"
          className="min-h-11 rounded-xl bg-card px-3 py-2 shadow-none dark:bg-card dark:border-border"
          isDisabled={!connected || isBusy}
          onPress={() => {
            void apple.manage();
          }}
        >
          <ButtonText className="text-center text-[15px] font-medium">
            Manage Apple subscription
          </ButtonText>
        </Button>
      )}
      {overview && (
        <Button
          variant="ghost"
          className="min-h-11"
          isDisabled={!connected || !config || isBusy}
          onPress={() => {
            void apple.restore();
          }}
        >
          <ButtonText className="text-center text-[13px] font-normal text-primary">
            Restore Apple purchases
          </ButtonText>
        </Button>
      )}
      {apple.message && (
        <Text className="text-muted-foreground">{apple.message}</Text>
      )}
      <ErrorMessage message={apple.error} />
    </View>
  );
  const sandboxControl = __DEV__ &&
    config?.environment === 'Sandbox' &&
    apple.hasPremium && (
      <View className="gap-2 rounded-xl bg-card p-4">
        <Text className="font-bold text-foreground">
          Sandbox test: allow another purchase
        </Text>
        <Text className="text-sm text-muted-foreground">
          Premium is already active. Enable only to test a second Apple
          purchase.
        </Text>
        <Switch
          value={apple.allowDuplicatePurchase}
          disabled={isBusy}
          onValueChange={apple.setAllowDuplicatePurchase}
          accessibilityLabel="Allow another sandbox purchase"
        />
        {sandboxOverride && purchaseOffer}
      </View>
    );
  return children({ actions, sandboxControl });
}
