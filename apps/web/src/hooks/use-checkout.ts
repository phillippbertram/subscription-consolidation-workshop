import { useEffect, useRef, useState } from 'react';
import { WebApiError } from '../api-client';
import { useApiClient } from './use-api-client';

export function useCheckout(userId: string | undefined) {
  const api = useApiClient();
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const [expired, setExpired] = useState(false);
  const inFlight = useRef(false);

  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);

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
      if (active.current) window.location.assign(session.url);
    } catch (error) {
      if (!active.current) return;
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
      if (active.current) setPending(false);
    }
  }
  function newAttempt() {
    if (!storageKey || !expired) return;
    sessionStorage.removeItem(storageKey);
    setExpired(false);
    setMessage('Ready for a new attempt. Continue to checkout when ready.');
  }
  return { message, pending, expired, checkout, newAttempt };
}
