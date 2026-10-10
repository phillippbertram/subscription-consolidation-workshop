import { StyleSheet, Text, View } from 'react-native';
import type { UserProfile } from '../../api/api-client';
import { colors, spacing } from '../../theme';

export function ProfileCard({ profile }: { profile: UserProfile }) {
  return (
    <View style={styles.card}>
      <Text style={styles.label}>INTERNAL USER ID</Text>
      <Text selectable style={styles.value}>
        {profile.userId}
      </Text>
      <Text style={styles.label}>CREATED AT</Text>
      <Text selectable style={styles.value}>
        {profile.createdAt}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.large,
    gap: spacing.medium,
    borderRadius: 20,
    backgroundColor: colors.surface,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    color: colors.text,
  },
  value: { fontSize: 16, color: colors.heading },
});
