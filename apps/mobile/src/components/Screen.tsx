import type { PropsWithChildren } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing } from '../theme';

type ScreenProps = PropsWithChildren<{ title: string; description: string }>;

export function Screen({ title, description, children }: ScreenProps) {
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.page}>
        <Text style={styles.eyebrow}>PREMIUMPASS · LOCAL DEMO</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  page: {
    flexGrow: 1,
    padding: spacing.page,
    gap: spacing.large,
    justifyContent: 'center',
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.5,
    color: colors.accent,
  },
  title: { fontSize: 34, fontWeight: '700', color: colors.heading },
  description: { fontSize: 17, lineHeight: 25, color: colors.text },
});
