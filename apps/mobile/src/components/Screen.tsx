import type { PropsWithChildren } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from './ui/text';

type ScreenProps = PropsWithChildren<{ title: string; description: string }>;

export function Screen({ title, description, children }: ScreenProps) {
  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <View className="flex-1 justify-center gap-6 p-7">
          <Text className="text-xs font-bold tracking-widest text-primary">
            PREMIUMPASS · LOCAL DEMO
          </Text>
          <Text
            accessibilityRole="header"
            className="text-4xl font-bold text-foreground"
          >
            {title}
          </Text>
          <Text className="text-lg leading-7 text-muted-foreground">
            {description}
          </Text>
          {children}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
