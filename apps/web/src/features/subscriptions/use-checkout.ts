import { useEffect, useReducer, useRef } from 'react';
import { z } from 'zod';
import {
  checkoutRequestIdSchema,
  stripePlanIdSchema,
  type StripePlanId,
} from '@premiumpass/api-contracts';
import { WebApiError } from '../../api/api-client';
import { useApiClient } from '../../api/use-api-client';

const storedAttemptSchema = z.object({
  requestId: checkoutRequestIdSchema,
  planId: stripePlanIdSchema,
});
type StoredAttempt = z.infer<typeof storedAttemptSchema>;

type State = {
  planId: StripePlanId;
  attempt: StoredAttempt | null;
  message: string;
  pending: boolean;
  canStartNewAttempt: boolean;
};
type Action =
  | { type: 'restore'; attempt: StoredAttempt | null }
  | { type: 'select'; planId: StripePlanId }
  | { type: 'start'; attempt: StoredAttempt }
  | { type: 'failure'; message: string; canStartNewAttempt: boolean }
  | { type: 'finish' }
  | { type: 'new' };

const initialState: State = {
  planId: 'premium_monthly',
  attempt: null,
  message: '',
  pending: false,
  canStartNewAttempt: false,
};

/** Selection belongs to one purchase intent; retries cannot change its period. */
function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'restore':
      return {
        ...initialState,
        attempt: action.attempt,
        planId: action.attempt?.planId ?? 'premium_monthly',
      };
    case 'select':
      return state.attempt || state.pending
        ? state
        : { ...state, planId: action.planId };
    case 'start':
      return {
        ...state,
        attempt: action.attempt,
        planId: action.attempt.planId,
        pending: true,
        canStartNewAttempt: false,
        message: 'Preparing your Stripe test checkout…',
      };
    case 'failure':
      return {
        ...state,
        message: action.message,
        canStartNewAttempt: action.canStartNewAttempt,
      };
    case 'finish':
      return { ...state, pending: false };
    case 'new':
      return state.canStartNewAttempt
        ? {
            ...initialState,
            planId: state.planId,
            message: 'Choose a billing period and continue when ready.',
          }
        : state;
  }
}

/** Older tabs stored only a UUID, and could only have selected the monthly plan. */
function readAttempt(storageKey: string): StoredAttempt | null {
  const stored = sessionStorage.getItem(storageKey);
  if (!stored) {
    return null;
  }

  if (checkoutRequestIdSchema.safeParse(stored).success) {
    return { requestId: stored, planId: 'premium_monthly' };
  }

  return storedAttemptSchema.parse(JSON.parse(stored));
}

export function useCheckout(userId: string | undefined) {
  const api = useApiClient();
  const [state, dispatch] = useReducer(reducer, initialState);
  const inFlight = useRef(false);
  const active = useRef(true);
  const storageKey = userId ? `premiumpass:checkout:${userId}` : undefined;

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);

  useEffect(() => {
    try {
      dispatch({
        type: 'restore',
        attempt: storageKey ? readAttempt(storageKey) : null,
      });
    } catch {
      dispatch({
        type: 'failure',
        message:
          'Unable to restore this tab’s checkout attempt. Check browser storage before continuing.',
        canStartNewAttempt: false,
      });
    }
  }, [storageKey]);

  async function checkout() {
    if (!storageKey || inFlight.current) {
      return;
    }

    inFlight.current = true;
    try {
      // Store the plan with the request ID before sending anything. After a lost
      // response or reload, recover that intent rather than offering a different
      // period under the same idempotency key. No tokens or URLs go in storage.
      const attempt = readAttempt(storageKey) ?? {
        requestId: crypto.randomUUID(),
        planId: state.planId,
      };
      sessionStorage.setItem(storageKey, JSON.stringify(attempt));
      dispatch({ type: 'start', attempt });
      const session = await api.checkout(attempt.requestId, attempt.planId);
      if (active.current) {
        window.location.assign(session.url);
      }
    } catch (error) {
      if (!active.current) {
        return;
      }

      dispatch({
        type: 'failure',
        message:
          error instanceof WebApiError
            ? error.message
            : 'Unable to open checkout. Check your session and backend, then retry the same attempt.',
        canStartNewAttempt:
          error instanceof WebApiError &&
          ['checkout_expired', 'checkout_already_completed'].includes(
            error.code,
          ),
      });
    } finally {
      inFlight.current = false;
      if (active.current) {
        dispatch({ type: 'finish' });
      }
    }
  }

  function newAttempt() {
    if (!storageKey || !state.canStartNewAttempt || inFlight.current) {
      return;
    }

    try {
      sessionStorage.removeItem(storageKey);
      dispatch({ type: 'new' });
    } catch {
      dispatch({
        type: 'failure',
        message:
          'Unable to clear the completed checkout attempt from browser storage.',
        canStartNewAttempt: true,
      });
    }
  }

  return {
    ...state,
    planLocked: state.pending || state.attempt !== null,
    selectPlan: (planId: StripePlanId) => dispatch({ type: 'select', planId }),
    checkout,
    newAttempt,
  };
}

export type Checkout = ReturnType<typeof useCheckout>;
