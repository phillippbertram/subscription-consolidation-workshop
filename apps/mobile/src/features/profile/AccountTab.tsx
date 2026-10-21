import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { useAuth0 } from 'react-native-auth0';
import type { UserProfile } from '@premiumpass/api-contracts';
import { Badge, PageHeader } from '../../components/Brand';
import { DeveloperDetails } from '../../components/DeveloperDetails';
import { ErrorMessage } from '../../components/ErrorMessage';
import { Icon } from '../../components/Icon';
import { Button, ButtonText } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Text } from '../../components/ui/text';
import { Avatar, displayName } from './identity';

function Row({
  label,
  children,
  first,
}: {
  label: string;
  children: ReactNode;
  first?: boolean;
}) {
  return (
    <View
      className={`flex-row flex-wrap items-center justify-between gap-2 p-4 ${first ? '' : 'border-t border-border'}`}
    >
      <Text className="text-sm text-muted-foreground">{label}</Text>
      {children}
    </View>
  );
}

export function AccountTab({
  profile,
  tier,
  isSigningOut,
  authError,
  onSignOut,
  onOpenBilling,
  developerTools,
}: {
  profile: UserProfile | null;
  tier: 'free' | 'premium' | null;
  isSigningOut: boolean;
  authError: string | null;
  onSignOut: () => Promise<void>;
  onOpenBilling: () => void;
  developerTools: ReactNode;
}) {
  const { user } = useAuth0();
  return (
    <>
      <PageHeader
        title="Account"
        description="Your profile, sign-in, and the identifiers behind your account."
      />
      <Card className="gap-4 rounded-2xl p-5">
        <View className="gap-1">
          <Text className="text-lg font-semibold text-foreground">Profile</Text>
          <Text className="text-sm text-muted-foreground">
            Name and email come from your Auth0 login and are shared by the
            website and the apps.
          </Text>
        </View>
        <View className="flex-row items-center gap-4">
          <Avatar user={user} size="lg" />
          <View className="flex-1">
            <Text selectable className="text-lg font-semibold text-foreground">
              {displayName(user) ?? 'Signed-in user'}
            </Text>
            {user?.email && (
              <Text selectable className="text-sm text-muted-foreground">
                {user.email}
              </Text>
            )}
          </View>
        </View>
        <View className="rounded-xl border border-border">
          <Row label="Email" first>
            {!user?.email ? (
              <Text className="text-sm text-foreground">—</Text>
            ) : user.emailVerified === true ? (
              <Badge label="Verified" tone="success" icon="badgeCheck" />
            ) : (
              <Badge label="Not verified" tone="warning" icon="circleAlert" />
            )}
          </Row>
          <Row label="Plan">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Manage billing"
              className="flex-row items-center gap-2"
              onPress={onOpenBilling}
            >
              <Text className="text-sm text-foreground">
                {tier === 'premium'
                  ? 'Premium'
                  : tier === 'free'
                    ? 'Free'
                    : '—'}
              </Text>
              <Text className="text-sm font-medium text-primary">Manage</Text>
              <Icon name="chevron" size={14} color="primary" />
            </Pressable>
          </Row>
        </View>
      </Card>

      <Card className="gap-4 rounded-2xl p-5">
        <View className="gap-1">
          <Text className="text-lg font-semibold text-foreground">
            Developer details
          </Text>
          <Text className="text-sm text-muted-foreground">
            The backend maps your verified Auth0 subject to an internal user ID.
            Every purchase, on any store, is bound to that internal ID.
          </Text>
        </View>
        <View className="rounded-xl border border-border">
          <Identifier label="Auth0 subject" value={user?.sub} first />
          <Identifier label="Internal user ID" value={profile?.userId} />
          <Identifier
            label="Account created"
            mono={false}
            value={
              profile &&
              new Date(profile.createdAt).toLocaleString('en-US', {
                dateStyle: 'medium',
                timeStyle: 'short',
              })
            }
          />
        </View>
        <DeveloperDetails>{developerTools}</DeveloperDetails>
      </Card>

      <Card className="gap-4 rounded-2xl p-5">
        <View className="gap-1">
          <Text className="text-lg font-semibold text-foreground">Session</Text>
          <Text className="text-sm text-muted-foreground">
            Signing out ends your session on this device. It does not cancel any
            subscription.
          </Text>
        </View>
        <Button
          variant="outline"
          className="min-h-11 self-start rounded-xl"
          isDisabled={isSigningOut}
          onPress={() => {
            void onSignOut();
          }}
        >
          <Icon name="logOut" size={16} />
          <ButtonText>{isSigningOut ? 'Signing out…' : 'Sign out'}</ButtonText>
        </Button>
        <ErrorMessage message={authError} />
      </Card>
    </>
  );
}

function Identifier({
  label,
  value,
  first,
  mono = true,
}: {
  label: string;
  value: string | null | undefined;
  first?: boolean;
  mono?: boolean;
}) {
  return (
    <View className={`gap-1 p-4 ${first ? '' : 'border-t border-border'}`}>
      <Text className="text-sm text-muted-foreground">{label}</Text>
      <Text
        selectable
        className={
          mono ? 'font-mono text-xs text-foreground' : 'text-sm text-foreground'
        }
      >
        {value ?? '—'}
      </Text>
    </View>
  );
}
