import { useEffect, useState, type ReactNode } from 'react';
import { AppState, View } from 'react-native';
import { Button, ButtonText } from './ui/button';
import { DashboardIcon } from './DashboardIcon';

export function DeveloperDetails({ children }: { children: ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        setExpanded(false);
      }
    });
    return () => subscription.remove();
  }, []);

  return (
    <View className="gap-3 border-t border-border pt-2">
      <Button
        variant="ghost"
        className="min-h-12 justify-between px-0"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded(!expanded)}
      >
        <ButtonText className="text-muted-foreground">
          Developer tools
        </ButtonText>
        <View style={{ transform: [{ rotate: expanded ? '90deg' : '0deg' }] }}>
          <DashboardIcon name="chevron" />
        </View>
      </Button>
      {expanded && <View className="gap-4">{children}</View>}
    </View>
  );
}
