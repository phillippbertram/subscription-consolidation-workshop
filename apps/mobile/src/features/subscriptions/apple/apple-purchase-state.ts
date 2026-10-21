import type { AppleConfig } from '@premiumpass/api-contracts';
import { withDetails } from '../../../api/failure-details';

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
  | { type: 'verificationFailed'; error: string }
  | { type: 'duplicatePurchaseChanged'; allowed: boolean }
  // Failures carry the technical cause (see describeFailure) for the screen.
  | {
      type:
        | 'configurationFailed'
        | 'checkoutFailed'
        | 'purchaseFailed'
        | 'connectionFailed'
        | 'restoreFailed'
        | 'managementFailed';
      detail: string;
    }
  | {
      type:
        | 'checkoutStarted'
        | 'eligibilityChanged'
        | 'purchaseCancelled'
        | 'verificationStarted'
        | 'verificationSucceeded'
        | 'verificationsSettled'
        | 'restoreStarted'
        | 'restoreEmpty'
        | 'managementStarted'
        | 'managementRefreshStarted'
        | 'managementSucceeded'
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
      return {
        ...state,
        error: withDetails(
          'Apple purchases are unavailable. Check the local Apple configuration and reload the app.',
          action.detail,
        ),
      };
    case 'duplicatePurchaseChanged':
      return { ...state, allowDuplicatePurchase: action.allowed };
    case 'checkoutStarted':
      return { ...state, busy: true, error: null, message: null };
    case 'checkoutFailed':
      return {
        ...state,
        busy: false,
        error: withDetails(
          'Unable to start the purchase. Check your session and sandbox account.',
          action.detail,
        ),
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
        error: withDetails(
          'Apple could not complete the purchase. Please retry.',
          action.detail,
        ),
      };
    case 'connectionFailed':
      return {
        ...state,
        error: withDetails(
          'Cannot connect to the App Store. Check your sandbox account and retry.',
          action.detail,
        ),
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
        error: withDetails(
          'Unable to restore purchases. Check your sandbox account and retry.',
          action.detail,
        ),
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
        error: withDetails(
          'Unable to open or refresh Apple subscription management. Please retry.',
          action.detail,
        ),
      };
    case 'nativeActionFinished':
      return { ...state, nativeAction: false };
  }
}
