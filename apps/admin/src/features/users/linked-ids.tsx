import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import type {
  AdminProviderLink,
  AdminUser,
} from '@premiumpass/api-contracts/admin';
import { Button } from '@/components/ui/button';
import { Mono, Pill, ProviderBadge, Section } from '@/components/status';

const kindLabels: Record<AdminProviderLink['kind'], string> = {
  customer: 'Customer',
  subscription: 'Subscription',
  checkout_session: 'Checkout session',
  original_transaction: 'Original transaction',
  purchase: 'Purchase (token digest)',
  account_token: 'Account token',
};

/** The store-side names of the one internal ID the apps hand over. */
const accountTokenLabels: Record<AdminProviderLink['provider'], string> = {
  stripe: 'Account token',
  apple: 'appAccountToken',
  google: 'obfuscatedAccountId',
};

const bindingStyles: Record<AdminProviderLink['binding'], string> = {
  both: 'bg-success/10 text-success',
  binding_only: 'bg-warning/10 text-warning',
  record_only: 'bg-muted text-muted-foreground',
  other_user: 'bg-destructive/10 text-destructive',
  stored: 'bg-muted text-muted-foreground',
  derived: 'bg-info/10 text-info',
};

const bindingLabels: Record<AdminProviderLink['binding'], string> = {
  both: 'Bound',
  binding_only: 'Binding only',
  record_only: 'No binding yet',
  other_user: 'Other user',
  stored: 'Stored',
  derived: 'Derived',
};

/**
 * Which Stripe, Apple, and Google identifiers point to this user. Use them to
 * find the same customer or purchase in the Stripe Dashboard, App Store
 * Connect, or the Play Console.
 */
export function LinkedIds({ user }: { user: AdminUser }) {
  return (
    <Section
      title="Linked provider IDs"
      hint="“Bound” means the user's record and the provider owner binding name this user. Later events find their owner through that binding."
    >
      {/* A wrapping list instead of a table: long IDs and the link state
          both stay visible at narrow widths. */}
      <ul>
        {user.providerLinks.map((link) => (
          <li
            key={`${link.provider}-${link.kind}-${link.value}`}
            className="flex flex-wrap items-start gap-x-4 gap-y-1.5 border-t border-muted px-5 py-3 first:border-t-0"
          >
            <div className="flex w-56 shrink-0 flex-wrap items-center gap-2">
              <ProviderBadge provider={link.provider} />
              <span className="text-sm font-medium">
                {link.kind === 'account_token'
                  ? accountTokenLabels[link.provider]
                  : kindLabels[link.kind]}
              </span>
            </div>
            <div className="min-w-0 flex-[1_1_280px]">
              <span className="flex items-start gap-1">
                <Mono className="pt-1">{link.value}</Mono>
                {link.value !== 'creation pending' && (
                  <CopyButton value={link.value} />
                )}
              </span>
              {link.note && (
                <span className="block text-xs text-muted-foreground">
                  {link.note}
                </span>
              )}
            </div>
            <Pill className={bindingStyles[link.binding]}>
              {bindingLabels[link.binding]}
            </Pill>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <Button
      variant="ghost"
      size="icon-xs"
      aria-label={copied ? 'Copied' : 'Copy ID'}
      title={copied ? 'Copied' : 'Copy ID'}
      onClick={() => {
        // Clipboard access can be refused; the ID stays selectable either way.
        void navigator.clipboard
          .writeText(value)
          .then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1_500);
          })
          .catch(() => undefined);
      }}
    >
      {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
    </Button>
  );
}
