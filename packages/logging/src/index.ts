import pino from 'pino';

export type { Logger } from 'pino';

const levels = { debug: 10, info: 20, warn: 30, error: 40, silent: 50 };
export type LogLevel = keyof typeof levels;

export function readLogLevel(
  env: NodeJS.ProcessEnv,
  fallback: LogLevel = 'info',
): LogLevel {
  const value = env.LOG_LEVEL ?? fallback;
  if (!Object.hasOwn(levels, value)) {
    throw new Error('LOG_LEVEL must be debug, info, warn, error, or silent.');
  }

  return value as LogLevel;
}

export type LogValue = string | number | boolean | null;

// Long enough for IDs and statuses, short enough that a stray blob stays small.
const MAX_VALUE_LENGTH = 200;

/**
 * The allowlist behind every payload summary in the logs: copy only the named
 * top-level fields, and only when the value is a plain string, number, boolean,
 * or null. Nested objects (customer details, payment methods, signed tokens)
 * are dropped without being inspected, and long strings are shortened.
 *
 * A denylist would fail open when a provider adds a field. This fails closed:
 * a field appears in the logs only after someone names it here on purpose.
 */
export function pickFields(
  source: unknown,
  keys: readonly string[],
): Record<string, LogValue> {
  const picked: Record<string, LogValue> = {};
  if (typeof source !== 'object' || source === null) {
    return picked;
  }

  const record = source as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string') {
      picked[key] =
        value.length > MAX_VALUE_LENGTH
          ? `${value.slice(0, MAX_VALUE_LENGTH)}…`
          : value;
    } else if (
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      value === null
    ) {
      picked[key] = value;
    }
  }

  return picked;
}

/**
 * Like pickFields, for epoch timestamps: Stripe sends seconds, Apple and Google
 * send milliseconds. Logging ISO strings makes them readable without a
 * calculator. Values that are not valid timestamps are skipped.
 */
export function pickTimes(
  source: unknown,
  keys: readonly string[],
  unit: 'seconds' | 'milliseconds',
): Record<string, string> {
  const times: Record<string, string> = {};
  if (typeof source !== 'object' || source === null) {
    return times;
  }

  const record = source as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    // Google sends int64 values as numeric strings.
    const epoch =
      typeof value === 'string' && /^\d{1,16}$/.test(value)
        ? Number(value)
        : value;
    if (typeof epoch !== 'number') {
      continue;
    }

    const date = new Date(unit === 'seconds' ? epoch * 1000 : epoch);
    if (!Number.isNaN(date.getTime())) {
      times[key] = date.toISOString();
    }
  }

  return times;
}

export function createLogger(level: LogLevel, service: string) {
  return pino(
    {
      level,
      base: { service },
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: { level: (label) => ({ level: label }) },
    },
    pino.destination({ dest: 1, sync: true }),
  );
}
