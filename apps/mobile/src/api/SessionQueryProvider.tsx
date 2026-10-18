import { useEffect, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import * as Network from 'expo-network';
import {
  focusManager,
  onlineManager,
  QueryClientProvider,
} from '@tanstack/react-query';
import { createQueryClient } from './query-client';

export function SessionQueryProvider({
  isSigningOut,
  children,
}: {
  isSigningOut: boolean;
  children: ReactNode;
}) {
  // AppContent keys this provider by API and Auth0 identity. No cache is persisted.
  const [client] = useState(createQueryClient);

  useEffect(() => {
    // React Native has app/network events instead of browser focus events.
    // Forward them so cached account data can refresh on return or reconnect.
    focusManager.setFocused(AppState.currentState === 'active');
    const appState = AppState.addEventListener('change', (state) => {
      focusManager.setFocused(state === 'active');
    });
    let current = true;
    let receivedNetworkEvent = false;
    const network = Network.addNetworkStateListener((state) => {
      receivedNetworkEvent = true;
      onlineManager.setOnline(state.isConnected !== false);
    });
    void Network.getNetworkStateAsync()
      .then((state) => {
        // The initial async lookup can finish after a newer network event;
        // never let that older snapshot overwrite the live listener's result.
        if (current && !receivedNetworkEvent) {
          onlineManager.setOnline(state.isConnected !== false);
        }
      })
      .catch(() => {
        // An unknown network state must not block requests to the local API.
      });

    return () => {
      current = false;
      appState.remove();
      network.remove();
      void client.cancelQueries();
      client.clear();
    };
  }, [client]);

  useEffect(() => {
    if (isSigningOut) {
      void client.cancelQueries();
      client.clear();
    }
  }, [client, isSigningOut]);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
