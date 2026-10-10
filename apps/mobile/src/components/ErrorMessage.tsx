import { StyleSheet, Text } from 'react-native';
import { colors } from '../theme';

export function ErrorMessage({ message }: { message: string | null }) {
  if (!message) return null;
  return <Text style={styles.text}>{message}</Text>;
}

const styles = StyleSheet.create({
  text: { fontSize: 15, lineHeight: 22, color: colors.error },
});
