import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import {
  useIAP,
  ErrorCode,
  getAvailablePurchases,
  getPendingTransactionsIOS,
  syncIOS,
  finishTransaction,
  type Purchase,
} from 'expo-iap';
import { z } from 'zod';
import { ApiError } from '../../api/api-client';
import { useApiClient } from '../../api/use-api-client';
import { Card } from '../../components/ui/card';
import { Text } from '../../components/ui/text';
import { Button, ButtonText } from '../../components/ui/button';
import { ErrorMessage } from '../../components/ErrorMessage';

const configSchema = z.object({
  productId: z.string(),
  appAccountToken: z.uuid(),
  environment: z.literal('Sandbox'),
});
const operationSchema = z.object({
  operationId: z.uuid(),
  status: z.literal('pending'),
});
const statusSchema = z.object({ status: z.enum(['pending', 'completed']) });
type Config = z.infer<typeof configSchema>;

class PurchaseSyncError extends Error {}

export function ApplePurchaseCard(props: { onVerified: () => void }) {
  return Platform.OS === 'ios' ? <AppleStoreCard {...props} /> : null;
}

function AppleStoreCard({ onVerified }: { onVerified: () => void }) {
  const api = useApiClient();
  const [config, setConfig] = useState<Config>();
  const [busy, setBusy] = useState(false);
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
      if (existing) return existing;
      const signal = lifetime.current.signal;
      const work = async () => {
        if (signal.aborted || purchase.purchaseState !== 'purchased') return;
        const settings = await api.get(
          '/v1/billing/apple/config',
          configSchema,
          { signal },
        );
        if (purchase.productId !== settings.productId) return;
        if (
          !('appAccountToken' in purchase) ||
          purchase.appAccountToken?.toLowerCase() !== settings.appAccountToken
        )
          throw new PurchaseSyncError(
            'This Apple purchase belongs to a different PremiumPass account. Sign in with its original account.',
          );
        if (
          'environmentIOS' in purchase &&
          purchase.environmentIOS &&
          purchase.environmentIOS !== 'Sandbox'
        )
          throw new PurchaseSyncError(
            'Use an Apple sandbox purchase. Xcode simulation and production purchases are not supported.',
          );
        if (!signal.aborted) {
          setBusy(true);
          setError(null);
          setMessage('Verifying your purchase…');
        }
        const operation = await api.post(
          '/v1/billing/apple/sync',
          { transactionId: purchase.id },
          operationSchema,
          { signal },
        );
        const deadline = Date.now() + 60_000;
        while (!signal.aborted && Date.now() < deadline) {
          const result = await api.get(
            `/v1/billing/apple/sync/${operation.operationId}`,
            statusSchema,
            { signal },
          );
          if (signal.aborted) return;
          if (result.status === 'completed') {
            // Queue acceptance is insufficient: only a committed completion permits finish.
            await finishTransaction({ purchase, isConsumable: false });
            if (!signal.aborted) {
              setMessage('Purchase synchronized.');
              onVerifiedRef.current();
            }
            return;
          }
          await new Promise<void>((resolve) => setTimeout(resolve, 1_500));
        }
        if (!signal.aborted)
          throw new PurchaseSyncError(
            'Verification is still pending. Check the worker, then tap Restore purchases to retry.',
          );
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
          if (!signal.aborted && pending.current.size === 0) setBusy(false);
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
      if (lifetime.current.signal.aborted) return;
      setBusy(false);
      setMessage(null);
      setError(
        failure.code === ErrorCode.UserCancelled
          ? null
          : 'Apple could not complete the purchase. Please retry.',
      );
    },
    onError: () => {
      if (!lifetime.current.signal.aborted)
        setError(
          'Cannot connect to the App Store. Check your sandbox account and retry.',
        );
    },
  });

  useEffect(() => {
    if (!connected) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const settings = await api.get(
          '/v1/billing/apple/config',
          configSchema,
          { signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        setConfig(settings);
        await fetchProducts({ skus: [settings.productId], type: 'subs' });
        const unfinished = await getPendingTransactionsIOS();
        if (!controller.signal.aborted)
          for (const purchase of unfinished) void verify(purchase);
      } catch (failure) {
        if (!controller.signal.aborted)
          setError(
            failure instanceof ApiError
              ? failure.message
              : 'Apple purchases are unavailable. Check the local Apple configuration and reload the app.',
          );
      }
    })();
    return () => controller.abort();
  }, [api, connected, fetchProducts, verify]);

  useEffect(() => {
    if (!connected) return;
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active')
        void getPendingTransactionsIOS()
          .then((items) => {
            if (!lifetime.current.signal.aborted)
              for (const purchase of items) void verify(purchase);
          })
          .catch(() => undefined);
    });
    return () => listener.remove();
  }, [connected, verify]);

  async function buy() {
    if (!config) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      // Recheck the authenticated identity before opening the purchase sheet.
      const current = await api.get('/v1/billing/apple/config', configSchema, {
        signal: lifetime.current.signal,
      });
      if (lifetime.current.signal.aborted) return;
      if (current.appAccountToken !== config.appAccountToken) throw new Error();
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
    setBusy(true);
    setError(null);
    setMessage('Restoring purchases…');
    try {
      await syncIOS();
      const items = [
        ...(await getAvailablePurchases()),
        ...(await getPendingTransactionsIOS()),
      ];
      if (lifetime.current.signal.aborted) return;
      const relevant = [
        ...new Map(
          items
            .filter((p) => p.productId === config?.productId)
            .map((p) => [p.id, p]),
        ).values(),
      ];
      if (!relevant.length)
        setMessage('No purchases found for this Apple account.');
      for (const purchase of relevant) await verify(purchase);
    } catch {
      if (!lifetime.current.signal.aborted)
        setError(
          'Unable to restore purchases. Check your sandbox account and retry.',
        );
    } finally {
      if (!lifetime.current.signal.aborted) setBusy(false);
    }
  }

  const product = subscriptions.find((p) => p.id === config?.productId);
  return (
    <Card className="gap-4 rounded-2xl p-6">
      <Text className="text-xl font-bold text-foreground">
        Premium with Apple
      </Text>
      <Text className="text-muted-foreground">
        Monthly subscription · Sandbox
      </Text>
      {connected && config && !product && (
        <Text className="text-muted-foreground">
          The product is not available yet. Check its price, localization, and
          sandbox availability.
        </Text>
      )}
      <Button
        isDisabled={!connected || !config || !product || busy}
        onPress={() => {
          void buy();
        }}
      >
        <ButtonText>
          {busy
            ? 'Processing…'
            : product
              ? `Subscribe · ${product.displayPrice} / month`
              : 'Connecting to Apple…'}
        </ButtonText>
      </Button>
      <Button
        variant="outline"
        isDisabled={!connected || !config || busy}
        onPress={() => {
          void restore();
        }}
      >
        <ButtonText>Restore purchases</ButtonText>
      </Button>
      {message && <Text className="text-muted-foreground">{message}</Text>}
      <ErrorMessage message={error} />
    </Card>
  );
}
