let nextRequestId = 0;

interface Failure {
  code: string;
  message: string;
  status?: number;
}

export function startApiLog(
  method: string,
  url: string,
  params: unknown,
  body: unknown,
) {
  const id = ++nextRequestId;
  const startedAt = Date.now();
  const label = `[API #${id}] ${method.toUpperCase()} ${url}`;

  function write(event: string, details: Record<string, unknown>) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      // Log explicit fields, never entire Axios configs/errors with credentials.
      console.log(`${label} ${event}`, details);
    }
  }

  write('request', { params, body });
  return {
    response(status: number, body: unknown, serverRequestId: unknown) {
      write('response', {
        status,
        durationMs: Date.now() - startedAt,
        serverRequestId,
        body,
      });
    },
    error(error: Failure, body?: unknown) {
      write('error', {
        status: error.status,
        durationMs: Date.now() - startedAt,
        code: error.code,
        message: error.message,
        body,
      });
    },
  };
}

export type ApiRequestLog = ReturnType<typeof startApiLog>;
