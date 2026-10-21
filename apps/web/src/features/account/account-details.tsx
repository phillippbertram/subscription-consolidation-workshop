import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import type { UserProfile } from '@premiumpass/api-contracts';
import { formatDate } from '../../lib/format-date';
import { cn } from '../../lib/utils';
import { Button } from '../../components/ui/button';

export interface SessionProfile {
  name?: string | undefined;
  email?: string | undefined;
  emailVerified?: boolean | undefined;
  subject?: string | undefined;
}

/** Auth0 database users often have their email as name; avoid showing it twice. */
export function displayName(identity: SessionProfile | undefined) {
  if (identity?.name && identity.name !== identity.email) {
    return identity.name;
  }

  return identity?.email?.split('@')[0];
}

export function initials(identity: SessionProfile | undefined) {
  const name = displayName(identity) ?? '?';
  return name
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

export function Avatar({
  identity,
  className,
}: {
  identity: SessionProfile | undefined;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'flex size-8 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-secondary to-primary/25 text-xs font-semibold text-secondary-foreground',
        className,
      )}
      aria-hidden
    >
      {initials(identity)}
    </span>
  );
}

/**
 * The identifiers behind the account, for the workshop exercises. The backend
 * maps the verified Auth0 issuer and subject to the internal user ID, and every
 * purchase is bound to that internal ID rather than to an email address.
 */
export function DeveloperDetails({
  profile,
  identity,
}: {
  profile?: UserProfile | undefined;
  identity?: SessionProfile | undefined;
}) {
  const fields = [
    ['Auth0 subject', identity?.subject],
    ['Internal user ID', profile?.userId],
  ] as const;

  return (
    <dl className="divide-y rounded-lg border text-sm">
      {fields.map(([label, value]) => (
        <div
          key={label}
          className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 p-4"
        >
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="flex min-w-0 items-center gap-2">
            <code className="break-all font-mono text-xs">{value ?? '—'}</code>
            {value && <CopyButton value={value} label={label} />}
          </dd>
        </div>
      ))}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 p-4">
        <dt className="text-muted-foreground">Account created</dt>
        <dd>{profile ? formatDate(profile.createdAt) : '—'}</dd>
      </div>
    </dl>
  );
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      aria-label={`Copy ${label}`}
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {copied ? <Check className="text-success" /> : <Copy />}
    </Button>
  );
}
