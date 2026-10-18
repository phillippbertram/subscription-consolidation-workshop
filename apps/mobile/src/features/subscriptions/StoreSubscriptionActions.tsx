import type { ComponentProps } from 'react';
import { Platform } from 'react-native';
import { AppleSubscriptionActions } from './AppleSubscriptionActions';
import { GoogleSubscriptionActions } from './GoogleSubscriptionActions';

// Mount only the current platform's store hook and purchase listeners.
export function StoreSubscriptionActions(
  props: ComponentProps<typeof AppleSubscriptionActions>,
) {
  return Platform.OS === 'android' ? (
    <GoogleSubscriptionActions {...props} />
  ) : (
    <AppleSubscriptionActions {...props} />
  );
}
