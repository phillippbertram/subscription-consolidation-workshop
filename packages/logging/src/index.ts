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
