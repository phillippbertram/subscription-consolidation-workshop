import { useCallback, useEffect, useRef, useReducer } from 'react';
import { AppState } from 'react-native';
import {
  ErrorCode,
  useIAP,
  getAvailablePurchases,
  deepLinkToSubscriptions,
  type Purchase,
} from 'expo-iap';
import type { SubscriptionOverview } from '@premiumpass/api-contracts';
import type { ApiClient } from '../../../api/api-client';
import { useApiClient } from '../../../api/use-api-client';
import { canPurchasePremium } from '../subscription-presentation';
import {
  googlePurchaseReducer,
  initialGooglePurchaseState,
} from './google-purchase-state';

class GoogleUiError extends Error {}

/**
 * Google Play purchase flow for the Android app, separated from its buttons.
 *
 * 1. Load the backend's Google config: product, base plan, and this user's
 *    `obfuscatedAccountId` (the internal user ID that binds a purchase to us).
 * 2. Buy, restore, or open Play's subscription management.
 * 3. Send every purchase token to the backend and poll until the worker has
 *    verified it with Google, committed access, and acknowledged the purchase.
 *
 * The app never acknowledges purchases itself: Google refunds unacknowledged
 * test purchases, so acknowledgement must follow the backend's commit.
 */
export function useGooglePurchase({
  overview,
  onVerified,
}: {
  overview: SubscriptionOverview | null;
  onVerified: () => void;
}) {
  const api = useApiClient();
  const [state, dispatch] = useReducer(
    googlePurchaseReducer,
    initialGooglePurchaseState,
  );
  const { config, busy, message, error } = state;
  // Aborted on unmount: late async results must not update a closed screen.
  const lifetime = useRef(new AbortController());
  // One verification per purchase token, even if Play reports it twice.
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
        dispatch({ type: 'paymentPending' });
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

        dispatch({ type: 'verificationStarted' });
        if (await synchronizeGooglePurchase(api, token, signal)) {
          dispatch({ type: 'verificationSucceeded' });
          verifiedCallback.current();
        }
      })()
        .catch((failure: unknown) => {
          if (!signal.aborted) {
            // Do not display raw native/provider errors containing purchase payloads.
            dispatch({
              type: 'verificationFailed',
              error:
                failure instanceof GoogleUiError
                  ? failure.message
                  : 'Unable to verify this purchase. Check the signed-in account and backend, then restore to retry.',
            });
          }
        })
        .finally(() => {
          pending.current.delete(token);
          if (!signal.aborted && pending.current.size === 0) {
            dispatch({ type: 'verificationsSettled' });
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
        dispatch({
          type:
            failure.code === ErrorCode.UserCancelled
              ? 'purchaseCancelled'
              : 'purchaseFailed',
        });
      }
    },
    onError: () => {
      if (!lifetime.current.signal.aborted) {
        dispatch({ type: 'connectionFailed' });
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
        dispatch({ type: 'restoreFailed' });
      }
    }
  }, [verify]);

  // After connecting, and whenever the app returns to the foreground: load the
  // product and resume purchases that were not yet synchronized.
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

        dispatch({ type: 'configLoaded', config: settings });
        await fetchProducts({ skus: [settings.productId], type: 'subs' });
        if (!controller.signal.aborted) {
          await restore();
        }
      } catch {
        if (!controller.signal.aborted) {
          dispatch({ type: 'configurationFailed' });
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
  const offerPurchase = Boolean(overview && canPurchasePremium(overview));

  async function buy() {
    if (!config || !offer?.offerTokenAndroid || !offerPurchase) {
      return;
    }

    dispatch({ type: 'checkoutStarted' });
    try {
      // The account ID travels with the purchase; the backend compares it with
      // Google's verified response before granting anything.
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
        dispatch({ type: 'checkoutFailed' });
      }
    }
  }

  async function manage() {
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
        dispatch({ type: 'managementFailed' });
      }
    }
  }

  return {
    connected,
    config,
    offer,
    busy,
    message,
    error,
    offerPurchase,
    canManage: Boolean(
      overview?.subscriptions.some((s) => s.provider === 'google'),
    ),
    buy,
    restore,
    manage,
  };
}

/**
 * Hand one purchase token to the backend, then poll until the worker reports
 * it verified, committed, and acknowledged. Returns false if the screen closed.
 */
async function synchronizeGooglePurchase(
  api: ApiClient,
  purchaseToken: string,
  signal: AbortSignal,
) {
  const operation = await api.startGoogleSync({ purchaseToken }, { signal });
  const deadline = Date.now() + 60_000;
  while (!signal.aborted && Date.now() < deadline) {
    const status = await api.getGoogleSyncStatus(operation.operationId, {
      signal,
    });
    if (signal.aborted) {
      return false;
    }

    // The backend acknowledges only after committing access. Never call
    // finishTransaction here: it would acknowledge before server verification.
    if (status.status === 'completed') {
      return true;
    }

    await new Promise<void>((resolve) => setTimeout(resolve, 1_500));
  }

  if (!signal.aborted) {
    throw new GoogleUiError(
      'Verification is still pending. Restore purchases to retry.',
    );
  }

  return false;
}
