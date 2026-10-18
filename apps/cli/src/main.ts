import { createLocalSubscriptionStore } from './local-admin/store.js';
import { runCli } from './cli/commands.js';

const local = createLocalSubscriptionStore();
try {
  await runCli(local);
} catch (error) {
  console.error(
    error instanceof Error
      ? error.message
      : 'Local subscription command failed.',
  );
  process.exitCode = 1;
} finally {
  local.close();
}
