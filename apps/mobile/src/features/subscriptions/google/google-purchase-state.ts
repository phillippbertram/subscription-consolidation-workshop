import type { GoogleConfig } from '@premiumpass/api-contracts';

interface GooglePurchaseState {
  config: GoogleConfig | undefined;
  busy: boolean;
  message: string | null;
  error: string | null;
}

type GooglePurchaseAction =
  | { type: 'configLoaded'; config: GoogleConfig }
  | { type: 'verificationFailed'; error: string }
  | {
      type:
        | 'configurationFailed'
        | 'checkoutStarted'
        | 'checkoutFailed'
        | 'paymentPending'
        | 'purchaseCancelled'
        | 'purchaseFailed'
        | 'connectionFailed'
        | 'verificationStarted'
        | 'verificationSucceeded'
        | 'verificationsSettled'
        | 'restoreFailed'
        | 'managementFailed';
    };

export const initialGooglePurchaseState: GooglePurchaseState = {
  config: undefined,
  busy: false,
  message: null,
  error: null,
};

/**
 * Apply UI transitions together; Play and backend effects stay in the hook.
 * Busy covers checkout and verification. Background restore discovers purchases;
 * opening Play management returns before the user finishes in the external app.
 */
export function googlePurchaseReducer(
  state: GooglePurchaseState,
  action: GooglePurchaseAction,
): GooglePurchaseState {
  switch (action.type) {
    case 'configLoaded':
      return { ...state, config: action.config };
    case 'configurationFailed':
      return {
        ...state,
        error:
          'Google Play purchases are unavailable. Check the local Google configuration.',
      };
    case 'checkoutStarted':
      return { ...state, busy: true, error: null };
    case 'checkoutFailed':
      return {
        ...state,
        busy: false,
        error: 'Unable to open Google Play checkout. Please retry.',
      };
    case 'paymentPending':
      return {
        ...state,
        busy: false,
        message:
          'Payment is pending. Premium starts only after backend verification.',
      };
    case 'purchaseCancelled':
      return { ...state, busy: false, message: null, error: null };
    case 'purchaseFailed':
      return {
        ...state,
        busy: false,
        message: null,
        error:
          'Google Play could not complete the purchase. Check your license tester account and retry.',
      };
    case 'connectionFailed':
      return {
        ...state,
        error:
          'Cannot connect to Google Play. Use a Play-enabled device and retry.',
      };
    case 'verificationStarted':
      return {
        ...state,
        busy: true,
        error: null,
        message: 'Verifying your Google Play test purchase…',
      };
    case 'verificationSucceeded':
      return { ...state, message: 'Google Play purchase synchronized.' };
    case 'verificationFailed':
      return { ...state, message: null, error: action.error };
    case 'verificationsSettled':
      // The hook emits this only after the last pending purchase token settles.
      return { ...state, busy: false };
    case 'restoreFailed':
      return {
        ...state,
        error: 'Unable to restore Google Play purchases. Please retry.',
      };
    case 'managementFailed':
      return {
        ...state,
        error: 'Unable to open Google Play subscription management.',
      };
  }
}
