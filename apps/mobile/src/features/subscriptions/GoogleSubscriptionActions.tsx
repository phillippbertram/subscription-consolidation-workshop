import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState, Platform, View } from 'react-native';
import {
  ErrorCode,
  useIAP,
  getAvailablePurchases,
  deepLinkToSubscriptions,
  type Purchase,
} from 'expo-iap';
import type {
  GoogleConfig,
  SubscriptionOverview,
} from '@premiumpass/api-contracts';
import { useApiClient } from '../../api/use-api-client';
import { Text } from '../../components/ui/text';
import { Button, ButtonText } from '../../components/ui/button';
import { ErrorMessage } from '../../components/ErrorMessage';
import { canPurchasePremium } from './subscription-presentation';

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

function GoogleStoreActions({ overview, onVerified, children }: Props) {
  const api = useApiClient();
  const [config, setConfig] = useState<GoogleConfig>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lifetime = useRef(new AbortController());
  const pending = useRef(new Map<string, Promise<void>>());
  const verifiedCallback = useRef(onVerified);
  verifiedCallback.current = onVerified;
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    return () => controller.abort();
  }, []);

  const verify = useCallback(
    (purchase: Purchase) => {
      const token = purchase.purchaseToken;
      if (lifetime.current.signal.aborted) {
        return Promise.resolve();
      }

      if (purchase.purchaseState === 'pending') {
        setBusy(false);
        setMessage(
          'Payment is pending. Premium starts only after backend verification.',
        );
        return Promise.resolve();
      }

      if (
        !token ||
        purchase.purchaseState !== 'purchased' ||
        purchase.store !== 'google'
      ) {
        return Promise.resolve();
      }

      const existing = pending.current.get(token);
      if (existing) {
        return existing;
      }

      const signal = lifetime.current.signal;
      const task = (async () => {
        const settings = await api.getGoogleConfig({ signal });
        if (purchase.productId !== settings.productId) {
          return;
        }

        const reportedPackage =
          'packageNameAndroid' in purchase
            ? purchase.packageNameAndroid
            : undefined;
        const reportedOwner =
          'obfuscatedAccountIdAndroid' in purchase
            ? purchase.obfuscatedAccountIdAndroid
            : undefined;
        // Native metadata is an early UX check only. Missing metadata still goes
        // to the backend, which requires Google's authoritative owner response.
        if (
          (reportedPackage && reportedPackage !== settings.packageName) ||
          (reportedOwner && reportedOwner !== settings.obfuscatedAccountId)
        ) {
          throw new GoogleUiError(
            'Restore using the PremiumPass account that originally bought this subscription.',
          );
        }

        if (signal.aborted) {
          return;
        }

        setBusy(true);
        setError(null);
        setMessage('Verifying your Google Play test purchase…');
        const operation = await api.startGoogleSync(
          { purchaseToken: token },
          { signal },
        );
        const deadline = Date.now() + 60000;
        while (!signal.aborted && Date.now() < deadline) {
          const status = await api.getGoogleSyncStatus(operation.operationId, {
            signal,
          });
          if (signal.aborted) {
            return;
          }

          if (status.status === 'completed') {
            // The backend acknowledges only after committing access. Never call
            // finishTransaction here: it would acknowledge before server verification.
            setMessage('Google Play purchase synchronized.');
            verifiedCallback.current();
            return;
          }

          await new Promise<void>((resolve) => setTimeout(resolve, 1500));
        }

        if (!signal.aborted) {
          throw new GoogleUiError(
            'Verification is still pending. Restore purchases to retry.',
          );
        }
      })()
        .catch((failure: unknown) => {
          if (!signal.aborted) {
            setMessage(null);
            // Do not display raw native/provider errors containing purchase payloads.
            setError(
              failure instanceof GoogleUiError
                ? failure.message
                : 'Unable to verify this purchase. Check the signed-in account and backend, then restore to retry.',
            );
          }
        })
        .finally(() => {
          pending.current.delete(token);
          if (!signal.aborted && pending.current.size === 0) {
            setBusy(false);
          }
        });
      pending.current.set(token, task);
      return task;
    },
    [api],
  );

  const { connected, subscriptions, fetchProducts, requestPurchase } = useIAP({
    onPurchaseSuccess: (purchase) => {
      void verify(purchase);
    },
    onPurchaseError: (failure) => {
      if (!lifetime.current.signal.aborted) {
        setBusy(false);
        setMessage(null);
        setError(
          failure.code === ErrorCode.UserCancelled
            ? null
            : 'Google Play could not complete the purchase. Check your license tester account and retry.',
        );
      }
    },
    onError: () => {
      if (!lifetime.current.signal.aborted) {
        setError(
          'Cannot connect to Google Play. Use a Play-enabled device and retry.',
        );
      }
    },
  });

  const restore = useCallback(async () => {
    const signal = lifetime.current.signal;
    try {
      const purchases = await getAvailablePurchases();
      if (signal.aborted) {
        return;
      }

      await Promise.all(purchases.map(verify));
      if (!signal.aborted) {
        verifiedCallback.current();
      }
    } catch {
      if (!signal.aborted) {
        setError('Unable to restore Google Play purchases. Please retry.');
      }
    }
  }, [verify]);

  useEffect(() => {
    if (!connected) {
      return;
    }

    const controller = new AbortController();
    void (async () => {
      try {
        const settings = await api.getGoogleConfig({
          signal: controller.signal,
        });
        if (controller.signal.aborted) {
          return;
        }

        setConfig(settings);
        await fetchProducts({ skus: [settings.productId], type: 'subs' });
        if (!controller.signal.aborted) {
          await restore();
        }
      } catch {
        if (!controller.signal.aborted) {
          setError(
            'Google Play purchases are unavailable. Check the local Google configuration.',
          );
        }
      }
    })();

    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active' && !controller.signal.aborted) {
        void restore();
      }
    });
    return () => {
      controller.abort();
      listener.remove();
    };
  }, [api, connected, fetchProducts, restore]);

  const product = subscriptions.find(
    (p) => p.platform === 'android' && p.id === config?.productId,
  );
  const offers =
    product?.platform === 'android'
      ? product.subscriptionOffers.filter(
          (offer) =>
            offer.basePlanIdAndroid === config?.basePlanId &&
            offer.offerTokenAndroid,
        )
      : [];
  // The demo has one base plan and no offers. Ambiguous pricing must be fixed
  // in Play Console rather than silently picking a trial or another plan.
  const offer = offers.length === 1 ? offers[0] : undefined;
  const buy = async () => {
    if (
      !config ||
      !offer?.offerTokenAndroid ||
      !overview ||
      !canPurchasePremium(overview)
    ) {
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await requestPurchase({
        type: 'subs',
        request: {
          google: {
            skus: [config.productId],
            obfuscatedAccountId: config.obfuscatedAccountId,
            subscriptionOffers: [
              { sku: config.productId, offerToken: offer.offerTokenAndroid },
            ],
          },
        },
      });
    } catch {
      if (!lifetime.current.signal.aborted) {
        setBusy(false);
        setError('Unable to open Google Play checkout. Please retry.');
      }
    }
  };

  const manage = async () => {
    if (!config) {
      return;
    }

    try {
      await deepLinkToSubscriptions({
        skuAndroid: config.productId,
        packageNameAndroid: config.packageName,
      });
    } catch {
      if (!lifetime.current.signal.aborted) {
        setError('Unable to open Google Play subscription management.');
      }
    }
  };

  return children({
    sandboxControl: null,
    actions: (
      <View className="gap-2">
        <Text className="text-muted-foreground">
          Monthly subscription · Google Play license test
        </Text>
        {overview && canPurchasePremium(overview) && (
          <Button
            isDisabled={!connected || !config || !offer || busy}
            onPress={() => {
              void buy();
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
        {overview?.subscriptions.some((s) => s.provider === 'google') && (
          <Button
            variant="outline"
            isDisabled={!config || busy}
            onPress={() => {
              void manage();
            }}
          >
            <ButtonText>Manage Google Play subscription</ButtonText>
          </Button>
        )}
        <Button
          variant="ghost"
          isDisabled={!connected || !config || busy}
          onPress={() => {
            void restore();
          }}
        >
          <ButtonText>Restore Google Play purchases</ButtonText>
        </Button>
        {message && <Text className="text-muted-foreground">{message}</Text>}
        <ErrorMessage message={error} />
      </View>
    ),
  });
}

class GoogleUiError extends Error {}
