import * as prompts from '@clack/prompts';
import { z } from 'zod';
import type { EditMode } from '../local-admin/edit-subscriptions.js';
import { scenarios } from '../local-admin/seed-subscription.js';
import type { SubscriptionCommands } from './commands.js';

function answer<T extends string>(value: T | typeof prompts.CANCEL_SYMBOL): T {
  if (prompts.isCancel(value)) {
    prompts.cancel('No changes applied.');
    process.exit(0);
  }

  return value;
}

export async function interactive(
  commands: SubscriptionCommands,
  initialUserId?: string,
) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error(
      'Interactive mode needs a terminal. Use list, set, reconcile, or seed; see --help.',
    );
  }

  prompts.intro('PremiumPass local subscriptions');
  prompts.log.info(
    'DynamoDB Local only. Provider synchronization can overwrite local edits.',
  );
  const userId =
    initialUserId ??
    answer(
      await prompts.text({
        message: 'Internal user ID',
        validate: (value) =>
          z.uuid().safeParse(value).success ? undefined : 'Enter a valid UUID.',
      }),
    );
  const aggregate = await commands.list(userId);
  const action = answer(
    await prompts.select<EditMode | 'seed' | 'reconcile' | 'done'>({
      message: 'What would you like to do?',
      options: [
        { value: 'done', label: 'Finish without changes' },
        {
          value: 'reconcile',
          label: 'Reconcile from Stripe',
          hint: 'restore verified provider state in DynamoDB Local',
        },
        {
          value: 'free',
          label: 'Remove access now',
          hint: 'expire stored access, including Stripe / Apple',
        },
        { value: 'active', label: 'Activate for one hour' },
        { value: 'expiring', label: 'Activate for 30 seconds' },
        {
          value: 'seed',
          label: 'Apply a demo scenario',
          hint: 'only the two reserved mock records',
        },
      ],
    }),
  );
  if (action === 'reconcile') {
    const mode = answer(
      await prompts.select({
        message: 'How should Stripe be checked?',
        options: [
          { value: 'sync', label: 'Synchronize local subscriptions' },
          { value: 'preview', label: 'Preview changes without writing' },
        ],
      }),
    );
    await commands.reconcile(userId, { dryRun: mode === 'preview' });
  } else if (action === 'seed') {
    const scenario = answer(
      await prompts.select({
        message: 'Demo scenario',
        options: scenarios.map((value) => ({ value, label: value })),
      }),
    );
    await commands.seed(userId, scenario);
  } else if (action !== 'done') {
    if (!aggregate.subscriptions.length) {
      throw new Error('No subscriptions exist. Use a demo scenario first.');
    }

    const subscription = answer(
      await prompts.select({
        message: 'Which subscriptions should change?',
        options: [
          { value: '', label: 'All subscriptions for this user' },
          ...aggregate.subscriptions.map((s) => ({
            value: s.providerSubscriptionId,
            label: `${s.provider}: ${s.providerSubscriptionId}`,
          })),
        ],
      }),
    );
    await commands.set(userId, action, subscription ? { subscription } : {});
  }

  prompts.outro('Done.');
}
