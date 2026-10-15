import { createLocalSubscriptionStore } from '../src/local-admin/store.js';
import { runSubscriptionCli } from '../src/cli/commands.js';

const local = createLocalSubscriptionStore();
try {
  await runSubscriptionCli(local);
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
