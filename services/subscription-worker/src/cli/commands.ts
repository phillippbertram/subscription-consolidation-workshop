import { Command, Argument, InvalidArgumentError } from 'commander';
import * as prompts from '@clack/prompts';
import { z } from 'zod';
import {
  editSubscriptions,
  editModes,
  type EditMode,
  type EditOptions,
} from '../local-admin/edit-subscriptions.js';
import {
  scenarios,
  seedSubscription,
} from '../local-admin/seed-subscription.js';
import { reconcileLocalSubscriptions } from '../local-admin/reconcile-subscriptions.js';
import type { LocalSubscriptionStore } from '../local-admin/store.js';
import { showSubscriptions, showReconciliation } from './output.js';
import { interactive } from './interactive.js';

export function createSubscriptionCommands(local: LocalSubscriptionStore) {
  return {
    async list(this: void, userId: string) {
      const aggregate = await local.loadUser(userId);
      showSubscriptions(aggregate.subscriptions);
      return aggregate;
    },
    async set(
      this: void,
      userId: string,
      mode: EditMode,
      options: EditOptions,
    ) {
      const result = await editSubscriptions(local, userId, mode, options);
      console.info(
        `Applied ${mode} to ${result.count} subscription(s). Reload the app.`,
      );
      showSubscriptions(result.subscriptions);
    },
    async seed(
      this: void,
      userId: string,
      scenario: (typeof scenarios)[number],
    ) {
      await local.loadUser(userId);
      const result = await seedSubscription(
        local.store,
        local.tableName,
        userId,
        scenario,
      );
      console.info(
        `Applied demo scenario ${scenario}. Other subscriptions were preserved. Reload the app.`,
      );
      showSubscriptions(result.subscriptions);
    },
    async reconcile(this: void, userId: string, options: { dryRun?: boolean }) {
      const progress = process.stdout.isTTY ? prompts.spinner() : undefined;
      progress?.start('Checking Stripe test subscriptions…');
      try {
        const result = await reconcileLocalSubscriptions(local, userId, {
          ...options,
          onProgress: (message) => progress?.message(message),
        });
        const failed = result.rows.filter((row) =>
          row.result.startsWith('failed:'),
        );
        progress?.stop(
          failed.length ? 'Some checks failed.' : 'Check complete.',
        );
        showReconciliation(result.rows, Boolean(options.dryRun));
        showSubscriptions(result.subscriptions);
        if (failed.length) {
          throw new Error(
            `${failed.length} subscription(s) could not be verified. Successful updates remain applied; rerun to retry.`,
          );
        }
      } catch (error) {
        progress?.stop('Reconciliation could not complete.');
        throw error;
      }
    },
  };
}

export type SubscriptionCommands = ReturnType<
  typeof createSubscriptionCommands
>;

function parseUserId(value: string) {
  if (!z.uuid().safeParse(value).success) {
    throw new InvalidArgumentError('Use the internal user UUID from the app.');
  }

  return value;
}

function userArgument() {
  return new Argument('<user-id>', 'Internal user UUID').argParser(parseUserId);
}

export async function runSubscriptionCli(local: LocalSubscriptionStore) {
  const commands = createSubscriptionCommands(local);
  const program = new Command()
    .name('pnpm subscription')
    .description(
      'Inspect, edit, and reconcile subscriptions in premiumpass-local at http://127.0.0.1:8000.\nOnly reconcile reads Stripe test mode. No command modifies Stripe or targets AWS.',
    )
    .addArgument(
      new Argument('[user-id]', 'Internal UUID for interactive mode').argParser(
        parseUserId,
      ),
    )
    .action((userId?: string) => interactive(commands, userId));

  program
    .command('list')
    .description('Show stored subscriptions and current access')
    .addArgument(userArgument())
    .action(async (userId: string) => {
      await commands.list(userId);
    });

  program
    .command('set')
    .description(
      'Edit all existing subscriptions, or one selected subscription',
    )
    .addArgument(userArgument())
    .addArgument(
      new Argument('<mode>', 'Access scenario').choices([...editModes]),
    )
    .option('--subscription <id>', 'Only edit this provider subscription ID')
    .option(
      '--until <iso-date>',
      'Explicit future UTC access boundary for active (default: one hour)',
    )
    .action(commands.set);

  program
    .command('reconcile')
    .description(
      'Restore local Stripe subscriptions from verified current provider state',
    )
    .addArgument(userArgument())
    .option('--dry-run', 'Compare with Stripe without changing the database')
    .action(commands.reconcile);

  program
    .command('seed')
    .description(
      'Apply an old demo scenario to the two reserved mock records only',
    )
    .addArgument(userArgument())
    .addArgument(new Argument('<scenario>').choices([...scenarios]))
    .action(commands.seed);

  await program.parseAsync();
}
