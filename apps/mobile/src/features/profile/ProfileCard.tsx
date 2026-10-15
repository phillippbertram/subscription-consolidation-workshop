import type { UserProfile } from '@premiumpass/api-contracts';
import { Card } from '../../components/ui/card';
import { Text } from '../../components/ui/text';

export function ProfileCard({ profile }: { profile: UserProfile }) {
  return (
    <Card className="gap-4 rounded-2xl p-6">
      <Text className="text-xs font-bold tracking-widest text-muted-foreground">
        INTERNAL USER ID
      </Text>
      <Text selectable className="text-base text-foreground">
        {profile.userId}
      </Text>
      <Text className="text-xs font-bold tracking-widest text-muted-foreground">
        CREATED AT
      </Text>
      <Text selectable className="text-base text-foreground">
        {profile.createdAt}
      </Text>
    </Card>
  );
}
