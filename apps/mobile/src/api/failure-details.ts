import { ApiError } from './api-client';

// Long enough for a request URL, a backend error code, and a request ID.
const MAX_DETAIL_LENGTH = 400;

/**
 * Turn any failure into one line that a workshop participant can read, copy,
 * and search for. Screens show it below a short summary, so a generic "please
 * retry" no longer hides what actually failed.
 *
 * Every branch reads named fields only. Native store errors, Auth0 SDK errors,
 * and HTTP errors can carry purchase tokens, credentials, or request headers
 * in their other fields, so a whole error object is never stringified.
 */
export function describeFailure(failure: unknown): string {
  return sanitize(describe(failure));
}

/**
 * The convention for error messages on screen: the first line is a short
 * summary, and everything after it is technical detail. `ErrorMessage` renders
 * the two parts differently.
 */
export function withDetails(summary: string, detail: string): string {
  return `${summary}\nDetails: ${detail}`;
}

/** Extend the summary line of such a message and keep its details below. */
export function appendToSummary(message: string, sentence: string): string {
  const [summary = '', ...details] = message.split('\n');
  return [`${summary} ${sentence}`, ...details].join('\n');
}

// The fields that store billing errors (expo-iap) and Auth0 errors share with
// plain errors. Reading them through one shape keeps this helper free of SDK
// imports, so any native module can report a failure the same way.
interface CodedFailure {
  message: string;
  code?: unknown;
  type?: unknown;
  responseCode?: unknown;
  debugMessage?: unknown;
}

function isCodedFailure(failure: unknown): failure is CodedFailure {
  return (
    typeof failure === 'object' &&
    failure !== null &&
    'message' in failure &&
    typeof failure.message === 'string'
  );
}

function describe(failure: unknown): string {
  if (failure instanceof ApiError) {
    const status = failure.status ? ` HTTP ${failure.status}` : '';
    const detail = failure.detail ? ` (${failure.detail})` : '';
    return `${failure.code}${status}: ${failure.message}${detail}`;
  }

  if (isCodedFailure(failure)) {
    // Google Play puts the BillingResult in `responseCode` and `debugMessage`;
    // together with the code they name the exact reason a purchase failed.
    const kind = [failure.code, failure.type].find(
      (value): value is string => typeof value === 'string' && value !== '',
    );
    const name = kind ?? (failure instanceof Error ? failure.name : 'Error');
    const response =
      typeof failure.responseCode === 'number'
        ? ` (response ${failure.responseCode})`
        : '';
    const debug =
      typeof failure.debugMessage === 'string' && failure.debugMessage
        ? ` · ${failure.debugMessage}`
        : '';

    return `${name}${response}: ${failure.message || 'no message'}${debug}`;
  }

  return typeof failure === 'string' && failure ? failure : 'Unknown error';
}

function sanitize(text: string): string {
  // Details are one line, so the summary/details convention above stays intact.
  const singleLine = text.replace(/\s+/g, ' ').trim();

  // A safety net, not a guarantee: hide anything that looks like a JWT or a
  // purchase token, in case a native message ever includes one.
  const redacted = singleLine
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[token]')
    .replace(/[A-Za-z0-9_-]{40,}/g, '[redacted]');

  return redacted.length > MAX_DETAIL_LENGTH
    ? `${redacted.slice(0, MAX_DETAIL_LENGTH - 1)}…`
    : redacted;
}
