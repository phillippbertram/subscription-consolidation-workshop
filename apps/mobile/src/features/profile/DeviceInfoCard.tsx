import { View } from 'react-native';
import { readMobileConfig } from '../../app/config';
import { Card } from '../../components/ui/card';
import { Text } from '../../components/ui/text';
import { readDeviceInfo } from './device-info';

/**
 * A small "this device" panel for workshops. Values are selectable, so a
 * participant can long-press one and paste it into a question or bug report.
 */
export function DeviceInfoCard() {
  // The app renders only after App.tsx read this configuration successfully,
  // so repeating the read here cannot fail and avoids threading props through
  // the dashboard.
  const entries = readDeviceInfo(readMobileConfig());

  return (
    <Card className="gap-4 rounded-2xl p-5">
      <View className="gap-1">
        <Text className="text-lg font-semibold text-foreground">
          This device
        </Text>
        <Text className="text-sm text-muted-foreground">
          The installed build and the phone it runs on. Check these first when
          sign-in or a purchase fails.
        </Text>
      </View>
      <View className="rounded-xl border border-border">
        {entries.map((entry, index) => (
          <View
            key={entry.label}
            className={`flex-row justify-between gap-4 p-4 ${index === 0 ? '' : 'border-t border-border'}`}
          >
            <Text className="text-sm text-muted-foreground">{entry.label}</Text>
            <Text
              selectable
              className="flex-1 text-right font-mono text-xs text-foreground"
            >
              {entry.value}
            </Text>
          </View>
        ))}
      </View>
    </Card>
  );
}
