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
      'Interactive mode needs a terminal. Use a subcommand; see pnpm cli --help.',
    );
  }

  prompts.intro('PremiumPass local subscriptions');
  prompts.log.info(
    'DynamoDB Local only. Complimentary grants are independent of provider synchronization.',
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
    await prompts.select<
      | EditMode
      | 'premium-grant'
      | 'premium-revoke'
      | 'seed'
      | 'stripe-sync'
      | 'reconcile'
      | 'done'
    >({
      message: 'What would you like to do?',
      options: [
        { value: 'done', label: 'Finish without changes' },
        { value: 'premium-grant', label: 'Give complimentary Premium' },
        {
          value: 'premium-revoke',
          label: 'Revoke complimentary Premium',
          hint: 'preserve paid subscriptions',
        },
        {
          value: 'reconcile',
          label: 'Reconcile providers through the local queue',
        },
        {
          value: 'stripe-sync',
          label: 'Synchronize directly from Stripe',
          hint: 'restore verified provider state in DynamoDB Local',
        },
        {
          value: 'free',
          label: 'Expire provider access (demo override)',
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
  if (action === 'premium-grant' || action === 'premium-revoke') {
    const reason = answer(
      await prompts.text({
        message: 'Reason for this change (no secrets)',
        validate: (value) =>
          value?.trim() && value.trim().length <= 300
            ? undefined
            : 'Enter 1–300 characters.',
      }),
    );
    let until: string | undefined;
    let forever = false;
    if (action === 'premium-grant') {
      const duration = answer(
        await prompts.select({
          message: 'How long should access last?',
          options: [
            { value: 'until', label: 'Until a specific UTC timestamp' },
            { value: 'forever', label: 'Until revoked' },
          ],
        }),
      );
      forever = duration === 'forever';
      if (!forever) {
        until = answer(
          await prompts.text({
            message: 'Future UTC timestamp (e.g. 2026-12-01T12:00:00Z)',
            validate: (value) =>
              z.iso.datetime().safeParse(value).success &&
              Date.parse(value!) > Date.now()
                ? undefined
                : 'Enter a future UTC ISO timestamp.',
          }),
        );
      }
    }

    await commands.premium(
      userId,
      action === 'premium-grant' ? 'grant' : 'revoke',
      {
        reason,
        ...(until ? { until } : {}),
        ...(forever ? { forever } : {}),
      },
    );
  } else if (action === 'stripe-sync') {
    const mode = answer(
      await prompts.select({
        message: 'How should Stripe be checked?',
        options: [
          { value: 'sync', label: 'Synchronize local subscriptions' },
          { value: 'preview', label: 'Preview changes without writing' },
        ],
      }),
    );
    await commands.syncStripe(userId, { dryRun: mode === 'preview' });
  } else if (action === 'reconcile') {
    const provider = answer(
      await prompts.select({
        message: 'Which provider should be checked?',
        options: (['all', 'stripe', 'apple', 'google', 'none'] as const).map(
          (value) => ({
            value,
            label: value === 'none' ? 'Expiration only' : value,
          }),
        ),
      }),
    );
    const mode = answer(
      await prompts.select({
        message: 'Preview or enqueue refresh jobs?',
        options: [
          { value: 'preview', label: 'Preview without writing' },
          { value: 'enqueue', label: 'Enqueue for the local worker' },
        ],
      }),
    );
    await commands.reconcile({
      user: userId,
      provider,
      dryRun: mode === 'preview',
    });
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
