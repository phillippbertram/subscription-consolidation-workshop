import type { GoogleConfig } from '@premiumpass/api-contracts';
import { withDetails } from '../../../api/failure-details';

interface GooglePurchaseState {
  config: GoogleConfig | undefined;
  // True once Play answered the product query, so "no offer" is a real result
  // and not just a request that has not finished yet.
  productsLoaded: boolean;
  busy: boolean;
  message: string | null;
  error: string | null;
}

type GooglePurchaseAction =
  | { type: 'configLoaded'; config: GoogleConfig }
  | { type: 'verificationFailed'; error: string }
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
        | 'productsLoaded'
        | 'checkoutStarted'
        | 'paymentPending'
        | 'purchaseCancelled'
        | 'verificationStarted'
        | 'verificationSucceeded'
        | 'verificationsSettled';
    };

export const initialGooglePurchaseState: GooglePurchaseState = {
  config: undefined,
  productsLoaded: false,
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
    case 'productsLoaded':
      return { ...state, productsLoaded: true };
    case 'configurationFailed':
      return {
        ...state,
        error: withDetails(
          'Google Play purchases are unavailable. Check the local Google configuration.',
          action.detail,
        ),
      };
    case 'checkoutStarted':
      return { ...state, busy: true, error: null };
    case 'checkoutFailed':
      return {
        ...state,
        busy: false,
        error: withDetails(
          'Unable to open Google Play checkout. Please retry.',
          action.detail,
        ),
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
        error: withDetails(
          'Google Play could not complete the purchase. Check your license tester account and retry.',
          action.detail,
        ),
      };
    case 'connectionFailed':
      return {
        ...state,
        error: withDetails(
          'Cannot connect to Google Play. Use a Play-enabled device and retry.',
          action.detail,
        ),
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
        error: withDetails(
          'Unable to restore Google Play purchases. Please retry.',
          action.detail,
        ),
      };
    case 'managementFailed':
      return {
        ...state,
        error: withDetails(
          'Unable to open Google Play subscription management.',
          action.detail,
        ),
      };
  }
}
