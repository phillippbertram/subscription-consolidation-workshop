import { spawnSync } from 'node:child_process';
import { eventTypes } from '@premiumpass/billing-contracts';

// Share the webhook's allowlist so newly supported events are forwarded locally too.
// The CLI uses its own login; it prints the signing secret for manual .env setup.
const result = spawnSync(
  'stripe',
  [
    'listen',
    '--events',
    eventTypes.join(','),
    '--forward-to',
    'http://127.0.0.1:3002/v1/webhooks/stripe',
    ...process.argv.slice(2),
  ],
  { stdio: 'inherit' },
);

if (result.error) {
  console.error(
    'Could not start Stripe CLI. Install it and run stripe login first.',
  );
}

process.exitCode = result.status ?? (result.signal === 'SIGINT' ? 130 : 1);
