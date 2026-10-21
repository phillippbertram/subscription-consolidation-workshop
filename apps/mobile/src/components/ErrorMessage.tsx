import { View } from 'react-native';
import { Text } from './ui/text';

/**
 * Shows a failure in two parts. The first line is a short summary; further
 * lines are technical details (see `withDetails`). The details are selectable
 * so a workshop participant can copy them into a question or bug report.
 */
export function ErrorMessage({ message }: { message: string | null }) {
  if (!message) {
    return null;
  }

  const [summary, ...details] = message.split('\n');

  return (
    <View className="gap-1">
      <Text className="text-base leading-6 text-destructive">{summary}</Text>
      {details.length > 0 && (
        <Text selectable className="text-sm leading-5 text-muted-foreground">
          {details.join('\n')}
        </Text>
      )}
    </View>
  );
}
