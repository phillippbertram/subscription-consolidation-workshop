import console from 'node:console';
import { once } from 'node:events';
import { createServer, request as forwardRequest } from 'node:http';
import process from 'node:process';
import { concurrently } from 'concurrently';

const routes = new Map([
  ['/v1/webhooks/apple', 3003],
  ['/v1/webhooks/google', 3004],
]);

/** Route only store notifications; the provider services still verify each request. */
function forwardNotification(request, response) {
  const port = routes.get(request.url?.split('?')[0]);
  if (!port || request.method !== 'POST') {
    response.writeHead(404).end();
    return;
  }

  const upstream = forwardRequest(
    {
      hostname: '127.0.0.1',
      port,
      method: request.method,
      path: request.url,
      // Preserve Google's Authorization header and all signature-related headers.
      headers: { ...request.headers, host: `127.0.0.1:${port}` },
      timeout: 15_000,
    },
    (upstreamResponse) => {
      response.writeHead(
        upstreamResponse.statusCode ?? 502,
        upstreamResponse.headers,
      );
      upstreamResponse.once('error', () => response.destroy());
      upstreamResponse.pipe(response);
    },
  );
  upstream.once('timeout', () => upstream.destroy());
  upstream.once('error', () => {
    if (response.headersSent) {
      response.destroy();
      return;
    }

    // An offline receiver must trigger provider retries, never acknowledge delivery.
    response.writeHead(502, { 'content-type': 'application/json' });
    response.end('{"error":"webhook_unavailable"}');
  });
  request.once('error', () => upstream.destroy());
  response.once('close', () => upstream.destroy());
  // Streaming leaves signed bytes unchanged and avoids logging notification data.
  request.pipe(upstream);
}

async function listen() {
  // One local router lets Apple and Google share the account's ngrok dev domain.
  // Only these two POST paths are exposed; API, database, and queue stay private.
  const server = createServer(forwardNotification);
  server.listen(3005, '127.0.0.1');
  await once(server, 'listening');
  console.info('Webhook router listening on http://127.0.0.1:3005');
  console.info('Apple:  <ngrok HTTPS origin>/v1/webhooks/apple -> :3003');
  console.info('Google: <ngrok HTTPS origin>/v1/webhooks/google -> :3004');
  console.info('Keep the local webhook servers and worker running separately.');

  try {
    const { result } = concurrently(
      [
        { name: 'stripe', command: 'pnpm stripe:listen' },
        {
          name: 'ngrok',
          command: 'ngrok http http://127.0.0.1:3005 --log stdout',
        },
      ],
      { killOthersOn: ['success', 'failure'], killTimeout: 15_000 },
    );
    await result;
  } catch {
    throw new Error(
      'Webhook forwarding stopped. Check the Stripe/ngrok output and their local login configuration.',
    );
  } finally {
    server.close();
    server.closeAllConnections();
  }
}

try {
  await listen();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
