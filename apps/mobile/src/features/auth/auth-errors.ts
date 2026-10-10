import { WebAuthError, WebAuthErrorCodes } from 'react-native-auth0';

export function authErrorMessage(
  error: unknown,
  action: 'Sign-in' | 'Sign-out',
): string {
  // Never expose the SDK's raw message, response payload, or credentials.
  if (error instanceof WebAuthError) {
    switch (error.type) {
      case WebAuthErrorCodes.USER_CANCELLED:
        return `${action} was cancelled. Please retry when ready.`;
      case WebAuthErrorCodes.NETWORK_ERROR:
      case WebAuthErrorCodes.FAILED_TO_LOAD_URL:
      case WebAuthErrorCodes.TIMEOUT_ERROR:
        return `${action} could not reach Auth0. Check the internet connection and Auth0 domain.`;
      case WebAuthErrorCodes.INVALID_CONFIGURATION:
      case WebAuthErrorCodes.INVALID_CALLBACK_URL:
        return `${action} failed. Check the Native Client ID, callback/logout URLs, and app scheme, then rebuild if native settings changed.`;
      case WebAuthErrorCodes.ACCESS_DENIED:
        return `${action} was denied. Check the enabled user connection, API access, and Auth0 tenant policies.`;
      case WebAuthErrorCodes.TRANSACTION_ACTIVE_ALREADY:
        return 'Another authentication window is already open. Complete or close it before retrying.';
    }
  }
  return `${action} failed. Check the Auth0 application settings and retry. Your session has not been confirmed as changed.`;
}
