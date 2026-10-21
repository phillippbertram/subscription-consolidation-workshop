import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Icon, type IconName } from './Icon';
import { Text } from './ui/text';

export function Logo({ size = 'md' }: { size?: 'md' | 'lg' }) {
  const large = size === 'lg';
  return (
    <View className="flex-row items-center gap-2">
      <View
        className={`items-center justify-center rounded-lg bg-primary ${large ? 'h-10 w-10' : 'h-8 w-8'}`}
      >
        <Icon name="ticket" size={large ? 20 : 16} color="primary-foreground" />
      </View>
      <Text
        className={`font-semibold text-foreground ${large ? 'text-xl' : 'text-base'}`}
      >
        PremiumPass
      </Text>
    </View>
  );
}

export type Tone =
  'default' | 'success' | 'warning' | 'destructive' | 'secondary';

const toneClasses: Record<Tone, { box: string; text: string }> = {
  default: { box: 'bg-primary', text: 'text-primary-foreground' },
  success: { box: 'bg-success/10', text: 'text-success' },
  warning: { box: 'bg-warning/10', text: 'text-warning' },
  destructive: { box: 'bg-destructive/10', text: 'text-destructive' },
  secondary: { box: 'bg-secondary', text: 'text-secondary-foreground' },
};

const toneIconColors = {
  default: 'primary-foreground',
  success: 'success',
  warning: 'warning',
  destructive: 'destructive',
  secondary: 'secondary-foreground',
} as const;

/** A small status pill, the same shapes and tones as the website's badges. */
export function Badge({
  label,
  tone = 'secondary',
  icon,
}: {
  label: string;
  tone?: Tone;
  icon?: IconName;
}) {
  return (
    <View
      className={`flex-row items-center gap-1 rounded-full px-2.5 py-1 ${toneClasses[tone].box}`}
    >
      {icon && <Icon name={icon} size={12} color={toneIconColors[tone]} />}
      <Text className={`text-xs font-medium ${toneClasses[tone].text}`}>
        {label}
      </Text>
    </View>
  );
}

/** Reminds every screen that payments and data are not real. */
export function TestModeBadge() {
  return (
    <View className="flex-row items-center gap-1.5 rounded-full border border-warning/30 bg-warning/10 px-2.5 py-1">
      <View className="h-1.5 w-1.5 rounded-full bg-warning" />
      <Text className="text-xs font-medium text-warning">Test mode</Text>
    </View>
  );
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <View className="flex-row items-start justify-between gap-4">
      <View className="flex-1 gap-1">
        <Text
          accessibilityRole="header"
          className="text-3xl font-semibold text-foreground"
        >
          {title}
        </Text>
        <Text className="text-base text-muted-foreground">{description}</Text>
      </View>
      {action}
    </View>
  );
}

/** Checkmark bullet list used by the login screen and the upgrade card. */
export function CheckList({ items }: { items: string[] }) {
  return (
    <View className="gap-2.5">
      {items.map((item) => (
        <View key={item} className="flex-row items-start gap-2">
          <Icon name="check" size={16} color="success" />
          <Text className="flex-1 text-sm text-foreground">{item}</Text>
        </View>
      ))}
    </View>
  );
}
