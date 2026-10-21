import type { PropsWithChildren } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Logo } from './Brand';
import { Text } from './ui/text';

type ScreenProps = PropsWithChildren<{ title: string; description: string }>;

/** Full-screen message for setup and session restore, before any account data. */
export function Screen({ title, description, children }: ScreenProps) {
  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <View className="flex-1 justify-center gap-6 p-7">
          <Logo size="lg" />
          <View className="gap-3">
            <Text
              accessibilityRole="header"
              className="text-3xl font-semibold text-foreground"
            >
              {title}
            </Text>
            <Text className="text-base leading-6 text-muted-foreground">
              {description}
            </Text>
          </View>
          {children}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
