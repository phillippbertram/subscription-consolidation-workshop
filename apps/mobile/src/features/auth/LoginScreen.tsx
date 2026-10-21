import { ScrollView, View } from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { Button, ButtonText, ButtonSpinner } from '../../components/ui/button';
import { Text } from '../../components/ui/text';
import { ErrorMessage } from '../../components/ErrorMessage';
import { Icon, type IconName } from '../../components/Icon';
import { Badge, Logo, TestModeBadge } from '../../components/Brand';
import { themeColor } from '../../components/ui/gluestack-ui-provider/config';

interface LoginScreenProps {
  isBusy: boolean;
  error: string | null;
  onSignIn: () => Promise<void>;
}

const features: { icon: IconName; title: string; text: string }[] = [
  {
    icon: 'trendingUp',
    title: 'Score history',
    text: 'Follow your synthetic score month by month.',
  },
  {
    icon: 'smartphone',
    title: 'One account, every app',
    text: 'The same membership on the web, iPhone, and Android.',
  },
  {
    icon: 'billing',
    title: 'Pay where you are',
    text: 'App Store, Google Play, or Stripe on the website.',
  },
  {
    icon: 'shieldCheck',
    title: 'Access you can trust',
    text: 'Premium comes from verified payments, never from a redirect.',
  },
];

/**
 * The signed-out screen, a compact version of the website's landing page.
 * Workshop users are created in Auth0, so sign-in is the only action.
 */
export function LoginScreen({ isBusy, error, onSignIn }: LoginScreenProps) {
  const insets = useSafeAreaInsets();
  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <View className="gap-8 px-6 pb-6 pt-4">
          <View className="flex-row items-center justify-between">
            <Logo />
            <TestModeBadge />
          </View>
          <View className="gap-3">
            <Text
              accessibilityRole="header"
              className="text-4xl font-semibold leading-[44px] text-foreground"
            >
              Your score history, on every device.
            </Text>
            <Text className="text-base leading-6 text-muted-foreground">
              Subscribe once on the web, in the App Store, or on Google Play.
              PremiumPass keeps your membership in sync, so every app gives the
              same answer.
            </Text>
          </View>
          <PreviewCard />
          <View className="gap-4">
            {features.map((feature) => (
              <View key={feature.title} className="flex-row gap-3">
                <View className="h-10 w-10 items-center justify-center rounded-xl bg-secondary">
                  <Icon name={feature.icon} size={18} color="primary" />
                </View>
                <View className="flex-1 gap-0.5">
                  <Text className="font-semibold text-foreground">
                    {feature.title}
                  </Text>
                  <Text className="text-sm text-muted-foreground">
                    {feature.text}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
      <View
        className="gap-3 border-t border-border bg-card px-6 pt-4"
        style={{ paddingBottom: Math.max(insets.bottom, 16) }}
      >
        <ErrorMessage message={error} />
        <Button
          size="lg"
          className="min-h-12 rounded-xl"
          isDisabled={isBusy}
          onPress={() => {
            void onSignIn();
          }}
        >
          {isBusy && (
            <ButtonSpinner color="white" accessibilityLabel="Signing in" />
          )}
          <ButtonText className="text-base">Sign in to get started</ButtonText>
        </Button>
        <Text className="text-center text-xs text-muted-foreground">
          No real payments · Synthetic data · Cancel anytime
        </Text>
      </View>
    </SafeAreaView>
  );
}

/** Static example content, like the website hero; no account data is loaded yet. */
function PreviewCard() {
  return (
    <View
      accessible
      accessibilityLabel="Example: a score of 94 with an active Premium membership on web, iOS, and Android"
      className="gap-4 rounded-2xl border border-border bg-card p-5"
    >
      <View className="flex-row items-center justify-between">
        <Text className="text-sm font-semibold text-foreground">
          Score history
        </Text>
        <Badge label="Premium" tone="default" icon="sparkles" />
      </View>
      <View className="flex-row items-end gap-3">
        <Text className="text-5xl font-semibold text-foreground">94</Text>
        <View className="mb-2 flex-row items-center gap-1">
          <Icon name="trendingUp" size={14} color="success" />
          <Text className="text-xs font-medium text-success">
            +1 since last month
          </Text>
        </View>
      </View>
      <Svg
        width="100%"
        height={72}
        viewBox="0 0 320 72"
        preserveAspectRatio="none"
      >
        <Defs>
          <LinearGradient id="preview-area" x1="0" y1="0" x2="0" y2="1">
            <Stop
              offset="0"
              stopColor={themeColor('primary')}
              stopOpacity={0.25}
            />
            <Stop
              offset="1"
              stopColor={themeColor('primary')}
              stopOpacity={0}
            />
          </LinearGradient>
        </Defs>
        <Path
          d="M4,60 C50,54 70,48 110,42 S180,32 210,24 S280,12 316,8 L316,72 L4,72 Z"
          fill="url(#preview-area)"
        />
        <Path
          d="M4,60 C50,54 70,48 110,42 S180,32 210,24 S280,12 316,8"
          fill="none"
          stroke={themeColor('primary')}
          strokeWidth={3}
          strokeLinecap="round"
        />
      </Svg>
      <View className="flex-row items-center justify-between rounded-xl bg-muted px-3 py-2.5">
        <View>
          <Text className="text-xs font-medium text-foreground">
            Premium Monthly
          </Text>
          <Text className="text-xs text-muted-foreground">
            Same answer on Web, iOS, and Android
          </Text>
        </View>
        <Badge label="Active" tone="success" />
      </View>
    </View>
  );
}
