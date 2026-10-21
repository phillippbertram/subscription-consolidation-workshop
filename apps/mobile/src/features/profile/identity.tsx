import { View } from 'react-native';
import type { User } from 'react-native-auth0';
import { Text } from '../../components/ui/text';

/** Auth0 database users often have their email as name; avoid showing it twice. */
export function displayName(user: User | null | undefined) {
  if (user?.name && user.name !== user.email) {
    return user.name;
  }

  return user?.nickname ?? user?.email?.split('@')[0];
}

function initials(user: User | null | undefined) {
  return (displayName(user) ?? '?')
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

export function Avatar({
  user,
  size = 'sm',
}: {
  user: User | null | undefined;
  size?: 'sm' | 'lg';
}) {
  const large = size === 'lg';
  return (
    <View
      className={`items-center justify-center rounded-full bg-secondary ${large ? 'h-14 w-14' : 'h-9 w-9'}`}
    >
      <Text
        className={`font-semibold text-secondary-foreground ${large ? 'text-lg' : 'text-xs'}`}
      >
        {initials(user)}
      </Text>
    </View>
  );
}
