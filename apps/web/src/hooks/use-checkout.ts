import { useEffect, useRef, useState } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { WebApiError } from '../api-client';
import { useApiClient } from './use-api-client';

export function useCheckout() {
  const { isAuthenticated } = useAuth0();
  const api = useApiClient();
  const [userId, setUserId] = useState<string>();
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const [expired, setExpired] = useState(false);
  const inFlight = useRef(false);

  useEffect(() => {
    let active = true;
    setUserId(undefined);
    if (isAuthenticated) {
      void api
        .getProfile()
        .then((profile) => {
          if (active) setUserId(profile.userId);
        })
        .catch((error: unknown) => {
          if (active)
            setMessage(
              error instanceof WebApiError
                ? error.message
                : 'Unable to load your profile. Check the backend and sign in again.',
            );
        });
    }
    return () => {
      active = false;
    };
  }, [api, isAuthenticated]);

  const storageKey = userId ? `premiumpass:checkout:${userId}` : undefined;
  async function checkout() {
    if (!storageKey || inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setExpired(false);
    setMessage('Preparing your Stripe test checkout…');
    try {
      // Retain only the request identifier, never credentials or checkout URLs.
      const requestId =
        sessionStorage.getItem(storageKey) ?? crypto.randomUUID();
      sessionStorage.setItem(storageKey, requestId);
      const session = await api.checkout(requestId);
      window.location.assign(session.url);
    } catch (error) {
      setMessage(
        error instanceof WebApiError
          ? error.message
          : 'Unable to open checkout. Check your session and backend, then retry the same attempt.',
      );
      setExpired(
        error instanceof WebApiError && error.code === 'checkout_expired',
      );
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }
  function newAttempt() {
    if (!storageKey || !expired) return;
    sessionStorage.removeItem(storageKey);
    setExpired(false);
    setMessage('Ready for a new attempt. Continue to checkout when ready.');
  }
  return { userId, message, pending, expired, checkout, newAttempt };
}
