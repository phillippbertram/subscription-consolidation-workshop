import { ArrowRight, BadgeCheck, CircleAlert, LogOut } from 'lucide-react';
import type { UserProfile } from '@premiumpass/api-contracts';
import type { AccountState } from './use-account';
import {
  Avatar,
  DeveloperDetails,
  displayName,
  type SessionProfile,
} from './account-details';
import { AppLink } from '../../lib/navigation';
import { PageHeader } from '../../components/page-header';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '../../components/ui/card';

export function AccountPage({
  identity,
  profile,
  state,
  onSignOut,
}: {
  identity: SessionProfile;
  profile: UserProfile | undefined;
  state: AccountState;
  onSignOut: () => void;
}) {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Account"
        description="Your profile, sign-in, and the identifiers behind your account."
      />
      <div className="grid max-w-3xl gap-6">
        <Card className="gap-6 py-6">
          <CardHeader className="px-6">
            <CardTitle className="font-semibold">Profile</CardTitle>
            <CardDescription>
              Name and email come from your Auth0 login and are shared by the
              website and the mobile apps.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 px-6">
            <div className="flex items-center gap-4">
              <Avatar identity={identity} className="size-14 text-lg" />
              <div className="min-w-0">
                <p className="truncate text-lg font-semibold">
                  {displayName(identity) ?? 'Your account'}
                </p>
                <p className="truncate text-sm text-muted-foreground">
                  {identity.email}
                </p>
              </div>
            </div>
            <dl className="divide-y rounded-lg border text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 p-4">
                <dt className="text-muted-foreground">Email</dt>
                <dd className="flex flex-wrap items-center gap-2">
                  <span className="break-all">{identity.email ?? '—'}</span>
                  {identity.email &&
                    (identity.emailVerified === true ? (
                      <Badge variant="success">
                        <BadgeCheck /> Verified
                      </Badge>
                    ) : (
                      <Badge variant="warning">
                        <CircleAlert /> Not verified
                      </Badge>
                    ))}
                </dd>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 p-4">
                <dt className="text-muted-foreground">Plan</dt>
                <dd className="flex items-center gap-3">
                  {state.status === 'success'
                    ? state.entitlements.tier === 'premium'
                      ? 'Premium'
                      : 'Free'
                    : '—'}
                  <AppLink
                    to="/billing"
                    className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                  >
                    Manage <ArrowRight className="size-3.5" aria-hidden />
                  </AppLink>
                </dd>
              </div>
            </dl>
            {identity.email && identity.emailVerified !== true && (
              <p className="text-sm text-muted-foreground">
                Checkout requires a verified email. Open the verification email
                from Auth0, then sign out and in again.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="gap-6 py-6">
          <CardHeader className="px-6">
            <CardTitle className="font-semibold">Developer details</CardTitle>
            <CardDescription>
              The backend maps your verified Auth0 subject to an internal user
              ID. Every purchase, on any store, is bound to that internal ID.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-6">
            <DeveloperDetails profile={profile} identity={identity} />
          </CardContent>
        </Card>

        <Card className="gap-6 py-6">
          <CardHeader className="px-6">
            <CardTitle className="font-semibold">Session</CardTitle>
            <CardDescription>
              Signing out ends your session in this browser. It does not cancel
              any subscription.
            </CardDescription>
          </CardHeader>
          <CardFooter className="border-t-0 bg-transparent px-6 pb-0">
            <Button variant="outline" onClick={onSignOut}>
              <LogOut /> Sign out
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
