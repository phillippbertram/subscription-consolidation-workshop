import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState, Platform, Switch, View } from 'react-native';
import {
  useIAP,
  ErrorCode,
  getAvailablePurchases,
  getPendingTransactionsIOS,
  syncIOS,
  finishTransaction,
  showManageSubscriptionsIOS,
  type Purchase,
} from 'expo-iap';
import type {
  AppleConfig,
  SubscriptionOverview,
} from '@premiumpass/api-contracts';
import { ApiError, type ApiClient } from '../../api/api-client';
import { useApiClient } from '../../api/use-api-client';
import { Text } from '../../components/ui/text';
import { Button, ButtonText } from '../../components/ui/button';
import { ErrorMessage } from '../../components/ErrorMessage';
import { canPurchasePremium } from './subscription-presentation';

class PurchaseSyncError extends Error {}

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

function AppleStoreCard({
  overview,
  onVerified,
  children,
}: AppleSubscriptionActionsProps) {
  const api = useApiClient();
  const [config, setConfig] = useState<AppleConfig>();
  const [busy, setBusy] = useState(false);
  const [nativeAction, setNativeAction] = useState(false);
  const [allowDuplicatePurchase, setAllowDuplicatePurchase] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lifetime = useRef(new AbortController());
  const pending = useRef(new Map<string, Promise<void>>());
  const onVerifiedRef = useRef(onVerified);
  onVerifiedRef.current = onVerified;
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    return () => controller.abort();
  }, []);

  const verify = useCallback(
    (purchase: Purchase): Promise<void> => {
      const existing = pending.current.get(purchase.id);
      if (existing) {
        return existing;
      }

      const signal = lifetime.current.signal;
      const work = async () => {
        if (signal.aborted || purchase.purchaseState !== 'purchased') {
          return;
        }

        const settings = await api.getAppleConfig({ signal });
        if (purchase.productId !== settings.productId) {
          return;
        }

        if (
          !('appAccountToken' in purchase) ||
          purchase.appAccountToken?.toLowerCase() !== settings.appAccountToken
        ) {
          throw new PurchaseSyncError(
            'This Apple purchase belongs to a different PremiumPass account. Sign in with its original account.',
          );
        }

        if (
          'environmentIOS' in purchase &&
          purchase.environmentIOS &&
          purchase.environmentIOS !== 'Sandbox'
        ) {
          throw new PurchaseSyncError(
            'Use an Apple sandbox purchase. Xcode simulation and production purchases are not supported.',
          );
        }

        if (!signal.aborted) {
          setBusy(true);
          setError(null);
          setMessage('Verifying your purchase…');
        }

        await synchronizeApplePurchase(api, purchase.id, signal);
        if (signal.aborted) {
          return;
        }

        // Queue acceptance is insufficient: only a committed completion permits finish.
        await finishTransaction({ purchase, isConsumable: false });
        if (!signal.aborted) {
          setMessage('Purchase synchronized.');
          onVerifiedRef.current();
        }
      };

      const task = work()
        .catch((failure: unknown) => {
          if (!signal.aborted) {
            setMessage(null);
            setError(
              failure instanceof ApiError ||
                failure instanceof PurchaseSyncError
                ? failure.message
                : 'Unable to verify your purchase. Please retry.',
            );
          }
        })
        .finally(() => {
          pending.current.delete(purchase.id);
          if (!signal.aborted && pending.current.size === 0) {
            setBusy(false);
          }
        });
      pending.current.set(purchase.id, task);
      return task;
    },
    [api],
  );

  const { connected, subscriptions, fetchProducts, requestPurchase } = useIAP({
    onPurchaseSuccess: (purchase) => {
      void verify(purchase);
    },
    onPurchaseError: (failure) => {
      if (lifetime.current.signal.aborted) {
        return;
      }

      setBusy(false);
      setMessage(null);
      setError(
        failure.code === ErrorCode.UserCancelled
          ? null
          : 'Apple could not complete the purchase. Please retry.',
      );
    },
    onError: () => {
      if (!lifetime.current.signal.aborted) {
        setError(
          'Cannot connect to the App Store. Check your sandbox account and retry.',
        );
      }
    },
  });

  useEffect(() => {
    if (!connected) {
      return;
    }

    const controller = new AbortController();
    void (async () => {
      try {
        const settings = await api.getAppleConfig({
          signal: controller.signal,
        });
        if (controller.signal.aborted) {
          return;
        }

        setConfig(settings);
        await fetchProducts({ skus: [settings.productId], type: 'subs' });
        const unfinished = await getPendingTransactionsIOS();
        if (!controller.signal.aborted) {
          for (const purchase of unfinished) {
            void verify(purchase);
          }
        }
      } catch (failure) {
        if (!controller.signal.aborted) {
          setError(
            failure instanceof ApiError
              ? failure.message
              : 'Apple purchases are unavailable. Check the local Apple configuration and reload the app.',
          );
        }
      }
    })();

    return () => controller.abort();
  }, [api, connected, fetchProducts, verify]);

  useEffect(() => {
    if (!connected) {
      return;
    }

    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void getPendingTransactionsIOS()
          .then((items) => {
            if (!lifetime.current.signal.aborted) {
              for (const purchase of items) {
                void verify(purchase);
              }
            }
          })
          .catch(() => undefined);
      }
    });
    return () => listener.remove();
  }, [connected, verify]);

  const hasPremium = overview?.entitlements.tier === 'premium';
  const sandboxOverride =
    __DEV__ &&
    config?.environment === 'Sandbox' &&
    hasPremium &&
    allowDuplicatePurchase;
  const offerPurchase = Boolean(
    overview && (canPurchasePremium(overview) || sandboxOverride),
  );
  const canManage = Boolean(
    overview?.subscriptions.some(
      (subscription) => subscription.provider === 'apple',
    ),
  );
  const purchaseAllowed = useRef(offerPurchase);
  purchaseAllowed.current = offerPurchase;
  const isBusy = busy || nativeAction;

  async function buy() {
    if (!config || !purchaseAllowed.current || isBusy) {
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      // Recheck the backend before opening StoreKit, including purchases made on the web.
      const [current, latest] = await Promise.all([
        api.getAppleConfig({
          signal: lifetime.current.signal,
        }),
        api.getSubscriptionOverview({ signal: lifetime.current.signal }),
      ]);
      if (lifetime.current.signal.aborted) {
        return;
      }

      if (current.appAccountToken !== config.appAccountToken) {
        throw new Error();
      }

      const mayOverride =
        __DEV__ && current.environment === 'Sandbox' && sandboxOverride;
      if (
        !purchaseAllowed.current ||
        (!canPurchasePremium(latest) && !mayOverride)
      ) {
        setBusy(false);
        setMessage('Your subscription status changed. Refreshing your access.');
        onVerifiedRef.current();
        return;
      }

      await requestPurchase({
        type: 'subs',
        request: {
          apple: {
            sku: current.productId,
            appAccountToken: current.appAccountToken,
            andDangerouslyFinishTransactionAutomatically: false,
          },
        },
      });
    } catch {
      if (!lifetime.current.signal.aborted) {
        setBusy(false);
        setError(
          'Unable to start the purchase. Check your session and sandbox account.',
        );
      }
    }
  }

  async function restore() {
    setNativeAction(true);
    setError(null);
    setMessage('Restoring purchases…');
    try {
      await syncIOS();
      const items = [
        ...(await getAvailablePurchases()),
        ...(await getPendingTransactionsIOS()),
      ];
      if (lifetime.current.signal.aborted) {
        return;
      }

      const relevant = [
        ...new Map(
          items
            .filter((p) => p.productId === config?.productId)
            .map((p) => [p.id, p]),
        ).values(),
      ];
      if (!relevant.length) {
        setMessage('No purchases found for this Apple account.');
      }

      for (const purchase of relevant) {
        await verify(purchase);
      }
    } catch {
      if (!lifetime.current.signal.aborted) {
        setMessage(null);
        setError(
          'Unable to restore purchases. Check your sandbox account and retry.',
        );
      }
    } finally {
      if (!lifetime.current.signal.aborted) {
        setNativeAction(false);
      }
    }
  }

  async function manage() {
    if (!overview || isBusy) {
      return;
    }

    const appleSubscriptions = overview.subscriptions.filter(
      (subscription) => subscription.provider === 'apple',
    );
    setNativeAction(true);
    setError(null);
    setMessage(null);
    const signal = lifetime.current.signal;
    try {
      await showManageSubscriptionsIOS();
      if (signal.aborted) {
        return;
      }

      setMessage('Updating your subscription…');
      // A renewal setting can change without a new transaction. Refresh each known lineage.
      for (const subscription of appleSubscriptions) {
        const transactionId = /^Sandbox:([0-9]{1,64})$/.exec(
          subscription.providerSubscriptionId,
        )?.[1];
        if (transactionId) {
          await synchronizeApplePurchase(api, transactionId, signal);
        }
      }

      if (!signal.aborted) {
        setMessage('Subscription updated.');
      }
    } catch {
      if (!signal.aborted) {
        setMessage(null);
        setError(
          'Unable to open or refresh Apple subscription management. Please retry.',
        );
      }
    } finally {
      if (!signal.aborted) {
        setNativeAction(false);
        onVerifiedRef.current();
      }
    }
  }

  const product = subscriptions.find((p) => p.id === config?.productId);
  const purchaseOffer = offerPurchase && (
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
          void buy();
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
      {canManage && (
        <Button
          variant="outline"
          className="min-h-11 rounded-xl bg-card px-3 py-2 shadow-none dark:bg-card dark:border-border"
          isDisabled={!connected || isBusy}
          onPress={() => {
            void manage();
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
            void restore();
          }}
        >
          <ButtonText className="text-center text-[13px] font-normal text-primary">
            Restore Apple purchases
          </ButtonText>
        </Button>
      )}
      {message && <Text className="text-muted-foreground">{message}</Text>}
      <ErrorMessage message={error} />
    </View>
  );
  const sandboxControl = __DEV__ &&
    config?.environment === 'Sandbox' &&
    hasPremium && (
      <View className="gap-2 rounded-xl bg-card p-4">
        <Text className="font-bold text-foreground">
          Sandbox test: allow another purchase
        </Text>
        <Text className="text-sm text-muted-foreground">
          Premium is already active. Enable only to test a second Apple
          purchase.
        </Text>
        <Switch
          value={allowDuplicatePurchase}
          disabled={isBusy}
          onValueChange={setAllowDuplicatePurchase}
          accessibilityLabel="Allow another sandbox purchase"
        />
        {sandboxOverride && purchaseOffer}
      </View>
    );
  return children({ actions, sandboxControl });
}

async function synchronizeApplePurchase(
  api: ApiClient,
  transactionId: string,
  signal: AbortSignal,
) {
  const operation = await api.startAppleSync({ transactionId }, { signal });
  const deadline = Date.now() + 60_000;
  while (!signal.aborted && Date.now() < deadline) {
    const result = await api.getAppleSyncStatus(operation.operationId, {
      signal,
    });
    if (result.status === 'completed') {
      return;
    }

    await new Promise<void>((resolve) => setTimeout(resolve, 1_500));
  }

  if (!signal.aborted) {
    throw new PurchaseSyncError(
      'Verification is still pending. Refresh or restore purchases to retry.',
    );
  }
}
