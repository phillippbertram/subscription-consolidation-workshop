import { Command, Argument } from 'commander';
import { createLocalSubscriptionStore } from '../src/local-admin/store.js';
import {
  GoogleMockSource,
  mockScenarios,
} from '../src/processing/google-mock-source.js';
import { localReconciliationQueue } from '../src/reconciliation/local-runtime.js';

const local = createLocalSubscriptionStore();
const queue = localReconciliationQueue();
const program = new Command()
  .description('Change independent Google mock state in DynamoDB Local only.')
  .argument('<user-id>', 'Existing internal user UUID')
  .argument('<subscription-id>', 'Unique ID starting with mock_google_')
  .addArgument(new Argument('<scenario>').choices([...mockScenarios]))
  .option(
    '--until <iso-date>',
    'Future UTC boundary for active (default: one hour)',
  )
  .option(
    '--suppress-event',
    'Persist source state without notifying the worker',
  )
  .action(
    async (
      userId: string,
      subscriptionId: string,
      scenario: (typeof mockScenarios)[number],
      options: { until?: string; suppressEvent?: boolean },
    ) => {
      const { state, job } = await new GoogleMockSource(
        local.documentClient,
        local.tableName,
      ).set(userId, subscriptionId, scenario, new Date(), options.until);
      console.info(
        `Saved Google mock source revision ${state.revision}. Derived access has not been updated by this command.`,
      );
      if (options.suppressEvent) {
        console.info(
          'Notification suppressed. Reconciliation can discover the source change.',
        );
        return;
      }

      await queue.enqueue(job);
      console.info(
        'Notification accepted by the local queue. Check worker logs for processing.',
      );
    },
  );
try {
  await program.parseAsync();
} catch {
  console.error(
    'Google mock command failed. Check user/ownership, scenario, time, and local services. If source state was saved, reconcile to retry delivery.',
  );
  process.exitCode = 1;
} finally {
  queue.close();
  local.close();
}
