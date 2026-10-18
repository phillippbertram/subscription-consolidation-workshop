import type { AppleConfig } from '@premiumpass/api-contracts';

interface ApplePurchaseState {
  config: AppleConfig | undefined;
  busy: boolean;
  nativeAction: boolean;
  allowDuplicatePurchase: boolean;
  message: string | null;
  error: string | null;
}

type ApplePurchaseAction =
  | { type: 'configLoaded'; config: AppleConfig }
  | { type: 'configurationFailed' | 'verificationFailed'; error: string }
  | { type: 'duplicatePurchaseChanged'; allowed: boolean }
  | {
      type:
        | 'checkoutStarted'
        | 'checkoutFailed'
        | 'eligibilityChanged'
        | 'purchaseCancelled'
        | 'purchaseFailed'
        | 'connectionFailed'
        | 'verificationStarted'
        | 'verificationSucceeded'
        | 'verificationsSettled'
        | 'restoreStarted'
        | 'restoreEmpty'
        | 'restoreFailed'
        | 'managementStarted'
        | 'managementRefreshStarted'
        | 'managementSucceeded'
        | 'managementFailed'
        | 'nativeActionFinished';
    };

export const initialApplePurchaseState: ApplePurchaseState = {
  config: undefined,
  busy: false,
  nativeAction: false,
  allowDuplicatePurchase: false,
  message: null,
  error: null,
};

/**
 * Apply UI transitions together; StoreKit and backend effects stay in the hook.
 * Native actions can overlap verification, so their flags stay independent:
 * finishing a transaction must not unlock buttons while restore is still running.
 */
export function applePurchaseReducer(
  state: ApplePurchaseState,
  action: ApplePurchaseAction,
): ApplePurchaseState {
  switch (action.type) {
    case 'configLoaded':
      return { ...state, config: action.config };
    case 'configurationFailed':
      return { ...state, error: action.error };
    case 'duplicatePurchaseChanged':
      return { ...state, allowDuplicatePurchase: action.allowed };
    case 'checkoutStarted':
      return { ...state, busy: true, error: null, message: null };
    case 'checkoutFailed':
      return {
        ...state,
        busy: false,
        error:
          'Unable to start the purchase. Check your session and sandbox account.',
      };
    case 'eligibilityChanged':
      return {
        ...state,
        busy: false,
        message: 'Your subscription status changed. Refreshing your access.',
      };
    case 'purchaseCancelled':
      return { ...state, busy: false, message: null, error: null };
    case 'purchaseFailed':
      return {
        ...state,
        busy: false,
        message: null,
        error: 'Apple could not complete the purchase. Please retry.',
      };
    case 'connectionFailed':
      return {
        ...state,
        error:
          'Cannot connect to the App Store. Check your sandbox account and retry.',
      };
    case 'verificationStarted':
      return {
        ...state,
        busy: true,
        error: null,
        message: 'Verifying your purchase…',
      };
    case 'verificationSucceeded':
      return { ...state, message: 'Purchase synchronized.' };
    case 'verificationFailed':
      return { ...state, message: null, error: action.error };
    case 'verificationsSettled':
      // The hook emits this only after the last pending transaction settles.
      return { ...state, busy: false };
    case 'restoreStarted':
      return {
        ...state,
        nativeAction: true,
        error: null,
        message: 'Restoring purchases…',
      };
    case 'restoreEmpty':
      return {
        ...state,
        message: 'No purchases found for this Apple account.',
      };
    case 'restoreFailed':
      return {
        ...state,
        message: null,
        error:
          'Unable to restore purchases. Check your sandbox account and retry.',
      };
    case 'managementStarted':
      return { ...state, nativeAction: true, error: null, message: null };
    case 'managementRefreshStarted':
      return { ...state, message: 'Updating your subscription…' };
    case 'managementSucceeded':
      return { ...state, message: 'Subscription updated.' };
    case 'managementFailed':
      return {
        ...state,
        message: null,
        error:
          'Unable to open or refresh Apple subscription management. Please retry.',
      };
    case 'nativeActionFinished':
      return { ...state, nativeAction: false };
  }
}
