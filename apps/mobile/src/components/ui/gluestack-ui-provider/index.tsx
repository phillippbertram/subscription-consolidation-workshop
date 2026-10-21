import { useEffect, type PropsWithChildren } from 'react';
import { Appearance, StatusBar, View } from 'react-native';
import { config } from './config';

export function GluestackUIProvider({ children }: PropsWithChildren) {
  useEffect(() => {
    // The app has one light appearance, matching the website.
    Appearance.setColorScheme('light');
  }, []);

  return (
    <View style={[config.light, { flex: 1 }]}>
      <StatusBar barStyle="dark-content" />
      {children}
    </View>
  );
}
