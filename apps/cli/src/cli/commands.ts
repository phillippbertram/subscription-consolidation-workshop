import { Command, Argument, Option, InvalidArgumentError } from 'commander';
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
import {
  changePremium,
  listPremiumAudit,
  type PremiumOptions,
} from '../local-admin/premium.js';
import type { ReconciliationOptions } from '../reconciliation/run.js';

export function createSubscriptionCommands(local: LocalSubscriptionStore) {
  return {
    async list(this: void, userId: string) {
      const aggregate = await local.loadUser(userId);
      showSubscriptions(aggregate.subscriptions, aggregate.adminGrant);
      return aggregate;
    },
    async premium(
      this: void,
      userId: string,
      action: 'grant' | 'revoke',
      options: PremiumOptions,
    ) {
      const result = await changePremium(local, userId, action, options);
      console.info(
        `Complimentary Premium: ${result.outcome}. ${options.dryRun ? 'No writes performed.' : 'Refresh the app to see current access.'}`,
      );
      if (options.dryRun) {
        console.table([result.after ?? { state: 'absent' }]);
      }

      const aggregate = await local.loadUser(userId);
      showSubscriptions(aggregate.subscriptions, aggregate.adminGrant);
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
      const current = await local.loadUser(userId);
      showSubscriptions(current.subscriptions, current.adminGrant);
    },
    async seed(
      this: void,
      userId: string,
      scenario: (typeof scenarios)[number],
    ) {
      await local.loadUser(userId);
      await seedSubscription(local.store, local.tableName, userId, scenario);
      console.info(
        `Applied demo scenario ${scenario}. Other subscriptions were preserved. Reload the app.`,
      );
      const current = await local.loadUser(userId);
      showSubscriptions(current.subscriptions, current.adminGrant);
    },
    async reconcile(this: void, options: ReconciliationOptions) {
      const { reconcile } = await import('../reconciliation/run.js');
      await reconcile(local, options);
    },
    async syncStripe(
      this: void,
      userId: string,
      options: { dryRun?: boolean },
    ) {
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
        const current = await local.loadUser(userId);
        showSubscriptions(current.subscriptions, current.adminGrant);
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

export async function runCli(local: LocalSubscriptionStore) {
  const commands = createSubscriptionCommands(local);
  const program = new Command()
    .name('pnpm cli')
    .description(
      'Inspect, edit, and reconcile subscriptions in premiumpass-local at http://127.0.0.1:8000.\nProvider reads use Stripe test mode, Apple Sandbox, and Google Play test purchases. No command targets AWS.',
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

  const premium = program
    .command('premium')
    .description(
      'Grant, inspect, or revoke complimentary Premium in DynamoDB Local',
    );
  premium
    .command('list')
    .addArgument(userArgument())
    .description('Show current access, the admin grant, and its audit history')
    .action(async (userId: string) => {
      await commands.list(userId);
      console.table(
        (await listPremiumAudit(local, userId)).map((record) => ({
          requestId: record.requestId,
          revision: record.aggregateRevision,
          action: record.action,
          outcome: record.outcome,
          actor: record.actor,
          at: record.at,
          reason: record.reason,
          expiresAt: record.expiresAt,
        })),
      );
    });
  for (const action of ['grant', 'revoke'] as const) {
    const command = premium
      .command(action)
      .addArgument(userArgument())
      .description(
        action === 'grant'
          ? 'Give complimentary Premium without a purchase'
          : 'Revoke only complimentary Premium; preserve paid subscriptions',
      )
      .requiredOption(
        '--reason <text>',
        'Audit reason (1–300 characters; no secrets)',
      )
      .option(
        '--request-id <uuid>',
        'Reuse this ID when retrying the same request',
      )
      .option('--dry-run', 'Preview without database or outbox writes');
    if (action === 'grant') {
      command
        .option('--until <iso-date>', 'Expire at a future UTC timestamp')
        .option('--forever', 'Remain active until explicitly revoked');
    }

    command.action(async (userId: string, options: PremiumOptions) => {
      await commands.premium(userId, action, options);
    });
  }

  program
    .command('stripe-sync')
    .description(
      'Restore local Stripe subscriptions from verified current provider state',
    )
    .addArgument(userArgument())
    .option('--dry-run', 'Compare with Stripe without changing the database')
    .action(commands.syncStripe);

  program
    .command('seed')
    .description(
      'Apply an old demo scenario to the two reserved mock records only',
    )
    .addArgument(userArgument())
    .addArgument(new Argument('<scenario>').choices([...scenarios]))
    .action(commands.seed);

  program
    .command('reconcile')
    .description(
      'Discover provider updates and enqueue refresh jobs for the local worker',
    )
    .option('--user <uuid>', 'Only reconcile this internal user', parseUserId)
    .addOption(
      new Option(
        '--provider <provider>',
        'Provider to refresh; expiry always runs',
      )
        .choices(['all', 'stripe', 'apple', 'google', 'none'])
        .default('all'),
    )
    .option('--dry-run', 'Read and preview without database or queue writes')
    .option(
      '--watch',
      'Start now, then repeat every five minutes without overlapping runs',
    )
    .action(commands.reconcile);

  await program.parseAsync();
}
