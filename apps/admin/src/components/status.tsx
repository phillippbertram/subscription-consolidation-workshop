import type { ReactNode } from 'react';
import type { AdminCheck } from '@premiumpass/api-contracts/admin';
import { cn } from '@/lib/utils';

/** Text plus color, so a status never depends on hue alone. */
const severityStyles: Record<AdminCheck['severity'], string> = {
  ok: 'bg-success/10 text-success',
  info: 'bg-info/10 text-info',
  warning: 'bg-warning/10 text-warning',
  critical: 'bg-destructive/10 text-destructive',
};

const severityLabels: Record<AdminCheck['severity'], string> = {
  ok: 'OK',
  info: 'Info',
  warning: 'Warning',
  critical: 'Critical',
};

export function SeverityBadge({
  severity,
}: {
  severity: AdminCheck['severity'];
}) {
  return (
    <Pill className={cn('min-w-18 justify-center', severityStyles[severity])}>
      {severityLabels[severity]}
    </Pill>
  );
}

const providerStyles: Record<string, string> = {
  stripe: 'bg-[#efeeff] text-[#4338ca]',
  apple: 'bg-zinc-100 text-zinc-800',
  google: 'bg-[#e8f0fe] text-[#174ea6]',
  apple_mock: 'bg-muted text-muted-foreground',
  local_expiration: 'bg-warning/10 text-warning',
  admin: 'bg-secondary text-secondary-foreground',
  outbox: 'bg-info/10 text-info',
};

const providerLabels: Record<string, string> = {
  stripe: 'Stripe',
  apple: 'Apple',
  google: 'Google',
  apple_mock: 'Demo',
  local_expiration: 'Expiration',
  admin: 'Complimentary',
  outbox: 'Outbox',
};

/** `inactive` marks a source that grants nothing now, by more than color. */
export function ProviderBadge({
  provider,
  inactive = false,
}: {
  provider: string;
  inactive?: boolean;
}) {
  return (
    <span
      title={inactive ? 'Grants no access now' : undefined}
      className={cn(
        'inline-flex shrink-0 items-center rounded-md px-2 py-0.5 text-xs font-medium',
        inactive
          ? 'bg-muted text-muted-foreground line-through'
          : (providerStyles[provider] ?? 'bg-muted text-muted-foreground'),
      )}
    >
      {providerLabels[provider] ?? provider}
    </span>
  );
}

export function TierBadge({ tier }: { tier: 'free' | 'premium' }) {
  return (
    <Pill
      className={
        tier === 'premium'
          ? 'bg-secondary text-secondary-foreground'
          : 'bg-muted text-muted-foreground'
      }
    >
      {tier === 'premium' ? 'Premium' : 'Free'}
    </Pill>
  );
}

export function Pill({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex w-fit shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap',
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Mono({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <span className={cn('font-mono text-xs break-all', className)}>
      {children}
    </span>
  );
}

/** A titled card section; `hint` explains what the records mean. */
export function Section({
  title,
  hint,
  action,
  className,
  children,
}: {
  title: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        'min-w-0 overflow-hidden rounded-xl border bg-card',
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2 border-b px-5 py-4">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">{title}</h2>
          {hint && (
            <p className="mt-0.5 text-sm text-muted-foreground">{hint}</p>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function EmptyRow({ children }: { children: ReactNode }) {
  return (
    <p className="px-5 py-6 text-center text-sm text-muted-foreground">
      {children}
    </p>
  );
}

/** Wide tables scroll inside their card instead of widening the page. */
export function TableFrame({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-sm">
        {children}
      </table>
    </div>
  );
}

export function Th({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  return (
    <th
      className={cn(
        'bg-background px-5 py-2.5 text-xs font-semibold text-muted-foreground',
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  return (
    <td className={cn('border-t border-muted px-5 py-3 align-top', className)}>
      {children}
    </td>
  );
}
