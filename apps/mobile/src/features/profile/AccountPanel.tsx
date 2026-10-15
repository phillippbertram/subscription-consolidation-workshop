import { Modal, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth0 } from 'react-native-auth0';
import { GluestackUIProvider } from '../../components/ui/gluestack-ui-provider';
import { Button, ButtonText } from '../../components/ui/button';
import { Text } from '../../components/ui/text';
import { ErrorMessage } from '../../components/ErrorMessage';
import { DashboardIcon } from '../../components/DashboardIcon';

interface AccountPanelProps {
  visible: boolean;
  isSigningOut: boolean;
  error: string | null;
  onClose: () => void;
  onSignOut: () => Promise<void>;
}

export function AccountPanel({
  visible,
  isSigningOut,
  error,
  onClose,
  onSignOut,
}: AccountPanelProps) {
  const { user } = useAuth0();
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <GluestackUIProvider>
        <SafeAreaView className="flex-1 bg-background">
          <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
            <View className="gap-8 p-6">
              <View className="flex-row items-center justify-between gap-4">
                <Text
                  accessibilityRole="header"
                  className="text-2xl font-semibold text-foreground"
                >
                  Account
                </Text>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-11 w-11 rounded-full"
                  accessibilityLabel="Close account"
                  onPress={onClose}
                >
                  <DashboardIcon name="close" />
                </Button>
              </View>
              <View className="gap-2">
                <Text
                  selectable
                  className="text-xl font-medium text-foreground"
                >
                  {user?.name ?? user?.nickname ?? 'Signed-in user'}
                </Text>
                {user?.email && (
                  <Text selectable className="text-muted-foreground">
                    {user.email}
                  </Text>
                )}
              </View>
              <View className="gap-4">
                <Button
                  variant="outline"
                  className="min-h-12 rounded-xl"
                  isDisabled={isSigningOut}
                  onPress={() => {
                    void onSignOut();
                  }}
                >
                  <ButtonText>
                    {isSigningOut ? 'Signing out…' : 'Sign out'}
                  </ButtonText>
                </Button>
                <ErrorMessage message={error} />
              </View>
            </View>
          </ScrollView>
        </SafeAreaView>
      </GluestackUIProvider>
    </Modal>
  );
}
