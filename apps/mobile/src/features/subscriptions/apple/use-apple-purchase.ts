import { useCallback, useEffect, useRef, useReducer } from 'react';
import { AppState } from 'react-native';
import {
  useIAP,
  ErrorCode,
  getAvailablePurchases,
  getPendingTransactionsIOS,
  syncIOS,
  showManageSubscriptionsIOS,
  type Purchase,
} from 'expo-iap';
import type { SubscriptionOverview } from '@premiumpass/api-contracts';
import type { ApiClient } from '../../../api/api-client';
import { describeFailure, withDetails } from '../../../api/failure-details';
import { useApiClient } from '../../../api/use-api-client';
import { canPurchasePremium } from '../subscription-presentation';
import {
  applePurchaseReducer,
  initialApplePurchaseState,
} from './apple-purchase-state';

class PurchaseSyncError extends Error {}

/**
 * Apple purchase flow for the iOS app, separated from its buttons.
 *
 * 1. Load the backend's Apple config: product ID and this user's
 *    `appAccountToken` (the internal user ID that binds a purchase to us).
 * 2. Buy, restore, or manage through StoreKit.
 * 3. Send every purchased transaction ID to the backend and poll until the
 *    worker has verified it with Apple, committed access, and finished it.
 *
 * The app never grants access or finishes transactions itself; it only reports
 * what StoreKit returned and then refreshes the backend's answer.
 */
export function useApplePurchase({
  overview,
  onVerified,
}: {
  overview: SubscriptionOverview | null;
  onVerified: () => void;
}) {
  const api = useApiClient();
  const [state, dispatch] = useReducer(
    applePurchaseReducer,
    initialApplePurchaseState,
  );
  const { config, busy, nativeAction, allowDuplicatePurchase, message, error } =
    state;
  // Aborted on unmount: late async results must not update a closed screen.
  const lifetime = useRef(new AbortController());
  // One verification per transaction, even if StoreKit reports it twice.
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

        // Early, friendly feedback only. The backend checks the signed token again.
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
          dispatch({ type: 'verificationStarted' });
        }

        await synchronizeApplePurchase(api, purchase.id, signal);
        if (!signal.aborted) {
          dispatch({ type: 'verificationSucceeded' });
          onVerifiedRef.current();
        }
      };

      const task = work()
        .catch((failure: unknown) => {
          if (!signal.aborted) {
            // PurchaseSyncError texts are already specific; anything else
            // shows its technical cause below a short summary.
            dispatch({
              type: 'verificationFailed',
              error:
                failure instanceof PurchaseSyncError
                  ? failure.message
                  : withDetails(
                      'Unable to verify your purchase. Please retry.',
                      describeFailure(failure),
                    ),
            });
          }
        })
        .finally(() => {
          pending.current.delete(purchase.id);
          if (!signal.aborted && pending.current.size === 0) {
            dispatch({ type: 'verificationsSettled' });
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

      // StoreKit's own reason is the most useful part of a failed purchase.
      dispatch(
        failure.code === ErrorCode.UserCancelled
          ? { type: 'purchaseCancelled' }
          : { type: 'purchaseFailed', detail: describeFailure(failure) },
      );
    },
    onError: (failure) => {
      if (!lifetime.current.signal.aborted) {
        dispatch({
          type: 'connectionFailed',
          detail: describeFailure(failure),
        });
      }
    },
  });

  // After connecting: load config and product, then resume unfinished transactions.
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

        dispatch({ type: 'configLoaded', config: settings });
        await fetchProducts({ skus: [settings.productId], type: 'subs' });
        const unfinished = await getPendingTransactionsIOS();
        if (!controller.signal.aborted) {
          for (const purchase of unfinished) {
            void verify(purchase);
          }
        }
      } catch (failure) {
        if (!controller.signal.aborted) {
          dispatch({
            type: 'configurationFailed',
            detail: describeFailure(failure),
          });
        }
      }
    })();

    return () => controller.abort();
  }, [api, connected, fetchProducts, verify]);

  // Returning to the app can reveal transactions completed in the background.
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
  // Development-only switch for duplicate-purchase exercises in the Sandbox.
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

    dispatch({ type: 'checkoutStarted' });
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
        throw new PurchaseSyncError(
          'The account token changed since this screen loaded. Reload the app and retry.',
        );
      }

      const mayOverride =
        __DEV__ && current.environment === 'Sandbox' && sandboxOverride;
      if (
        !purchaseAllowed.current ||
        (!canPurchasePremium(latest) && !mayOverride)
      ) {
        dispatch({ type: 'eligibilityChanged' });
        onVerifiedRef.current();
        return;
      }

      // The token travels inside the signed Apple transaction and proves the owner.
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
    } catch (failure) {
      if (!lifetime.current.signal.aborted) {
        dispatch({ type: 'checkoutFailed', detail: describeFailure(failure) });
      }
    }
  }

  async function restore() {
    dispatch({ type: 'restoreStarted' });
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
        dispatch({ type: 'restoreEmpty' });
      }

      for (const purchase of relevant) {
        await verify(purchase);
      }
    } catch (failure) {
      if (!lifetime.current.signal.aborted) {
        dispatch({ type: 'restoreFailed', detail: describeFailure(failure) });
      }
    } finally {
      if (!lifetime.current.signal.aborted) {
        dispatch({ type: 'nativeActionFinished' });
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
    dispatch({ type: 'managementStarted' });
    const signal = lifetime.current.signal;
    try {
      await showManageSubscriptionsIOS();
      if (signal.aborted) {
        return;
      }

      dispatch({ type: 'managementRefreshStarted' });
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
        dispatch({ type: 'managementSucceeded' });
      }
    } catch (failure) {
      if (!signal.aborted) {
        dispatch({
          type: 'managementFailed',
          detail: describeFailure(failure),
        });
      }
    } finally {
      if (!signal.aborted) {
        dispatch({ type: 'nativeActionFinished' });
        onVerifiedRef.current();
      }
    }
  }

  return {
    connected,
    config,
    product: subscriptions.find((p) => p.id === config?.productId),
    isBusy,
    message,
    error,
    hasPremium,
    offerPurchase,
    sandboxOverride,
    canManage,
    allowDuplicatePurchase,
    setAllowDuplicatePurchase: (allowed: boolean) => {
      dispatch({ type: 'duplicatePurchaseChanged', allowed });
    },
    buy,
    restore,
    manage,
  };
}

/**
 * Hand one transaction to the backend, then poll until the worker reports it
 * verified, committed, and finished with Apple. Closing the app does not stop
 * the backend work; a later restore checks again.
 */
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
      'Purchase completion is still pending. Restore purchases to check again.',
    );
  }
}
