import { useEffect, type PropsWithChildren } from 'react';
import { Appearance, StatusBar, View } from 'react-native';
import { config } from './config';

export function GluestackUIProvider({ children }: PropsWithChildren) {
  useEffect(() => {
    Appearance.setColorScheme('dark');
  }, []);

  return (
    <View style={[config.dark, { flex: 1 }]}>
      <StatusBar barStyle="light-content" />
      {children}
    </View>
  );
}
