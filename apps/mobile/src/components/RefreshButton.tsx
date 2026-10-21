import { Button } from './ui/button';
import { Spinner } from './ui/spinner';
import { Icon } from './Icon';

/** Manual refresh; the account also refreshes on focus, pull, and access boundaries. */
export function RefreshButton({
  refreshing,
  disabled,
  onPress,
}: {
  refreshing: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Button
      variant="outline"
      size="icon"
      className="h-11 w-11 rounded-full bg-card"
      isDisabled={disabled || refreshing}
      accessibilityLabel="Refresh account"
      onPress={onPress}
    >
      {refreshing ? (
        <Spinner accessibilityLabel="Refreshing account" />
      ) : (
        <Icon name="refresh" size={18} />
      )}
    </Button>
  );
}
