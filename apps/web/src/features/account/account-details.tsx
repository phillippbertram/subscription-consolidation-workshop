import { formatDate } from '../../lib/format-date';
import type { UserProfile } from '@premiumpass/api-contracts';

export interface SessionProfile {
  name?: string | undefined;
  email?: string | undefined;
  emailVerified?: boolean | undefined;
  subject?: string | undefined;
}

export function AccountDetails({
  profile,
  identity,
}: {
  profile?: UserProfile | undefined;
  identity?: SessionProfile | undefined;
}) {
  const fields = [
    ['Name', identity?.name],
    ['Email', identity?.email],
    [
      'Email verification',
      identity?.email
        ? identity.emailVerified === true
          ? 'Verified'
          : 'Not verified'
        : undefined,
    ],
    ['Auth0 subject', identity?.subject],
    ['Internal user ID', profile?.userId],
    ['Account created', profile ? formatDate(profile.createdAt) : undefined],
  ];
  return (
    <dl className="space-y-3 text-sm">
      {fields.map(([label, value]) =>
        value ? (
          <div key={label}>
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="mt-1 break-all">{value}</dd>
          </div>
        ) : null,
      )}
    </dl>
  );
}
