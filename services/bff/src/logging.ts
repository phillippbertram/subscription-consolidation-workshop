import pino from 'pino';
import { createMiddleware } from 'hono/factory';
import type { AppEnv } from './auth.js';

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

export function createLogger(level: LogLevel) {
  return pino(
    {
      level,
      base: { service: 'premiumpass-bff' },
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: { level: (label) => ({ level: label }) },
    },
    pino.destination({ dest: 1, sync: true }),
  );
}

export function requestLogger(level: LogLevel) {
  const logger = createLogger(level);
  return createMiddleware<AppEnv>(async (c, next) => {
    const startedAt = performance.now();
    const request = {
      requestId: c.get('requestId'),
      method: c.req.method,
      path: c.req.path,
    };
    const log = logger.child(request);
    log.info({ event: 'http.request' });

    // A clone preserves the original request bytes for handlers/signatures.
    const requestBody = level === 'debug' ? previewBody(c.req.raw) : undefined;
    await next();

    const durationMs = Math.round((performance.now() - startedAt) * 100) / 100;
    const status = c.res.status;
    const severity = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';
    const details =
      level === 'debug'
        ? {
            query: c.req.queries(),
            requestBody: await requestBody,
            responseBody: await previewBody(c.res),
            error: c.error
              ? {
                  name: c.error.name,
                  message: c.error.message,
                  stack: c.error.stack,
                }
              : undefined,
          }
        : {};
    log[severity]({
      event: 'http.response',
      status,
      durationMs,
      ...details,
    });
  });
}

// Bound both preview size and waiting time; logging must not drain a stream.
async function previewBody(message: Request | Response): Promise<unknown> {
  if (!message.body) return undefined;
  const contentType = message.headers.get('content-type') ?? '';
  if (
    !/^(application\/(?:[\w.-]+\+)?json|text\/plain)(?:;|$)/i.test(contentType)
  ) {
    return { omitted: 'Unsupported content type' };
  }
  const maxBytes = 8192;
  if (Number(message.headers.get('content-length')) > maxBytes) {
    return { omitted: 'Body exceeds 8192 bytes' };
  }

  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    reader = message.clone().body?.getReader();
    if (!reader) return undefined;
    const bodyReader = reader;
    const read = async () => {
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const { done, value } = await bodyReader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) return { omitted: 'Body exceeds 8192 bytes' };
        chunks.push(value);
      }
      const text = Buffer.concat(chunks).toString('utf8');
      if (!text) return undefined;
      if (contentType.toLowerCase().includes('json')) {
        try {
          return JSON.parse(text) as unknown;
        } catch {
          // Invalid JSON is still useful when debugging a malformed request.
        }
      }
      return text;
    };
    return await Promise.race([
      read(),
      new Promise((resolve) => {
        timer = setTimeout(
          () => resolve({ omitted: 'Body preview timed out' }),
          100,
        );
      }),
    ]);
  } catch {
    return { omitted: 'Body preview unavailable' };
  } finally {
    clearTimeout(timer);
    // Awaiting cancellation of a tee can wait for the original body consumer.
    if (reader) void reader.cancel().catch(() => undefined);
  }
}
