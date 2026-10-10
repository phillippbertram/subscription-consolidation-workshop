import type { PropsWithChildren } from 'react';
import { View } from 'react-native';
import { config } from './config';

// The app currently uses a fixed light theme, matching app.config.ts.
export function GluestackUIProvider({ children }: PropsWithChildren) {
  return <View style={[config.light, { flex: 1 }]}>{children}</View>;
}
