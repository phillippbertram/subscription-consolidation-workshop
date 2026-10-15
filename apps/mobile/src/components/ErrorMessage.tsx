import { Text } from './ui/text';

export function ErrorMessage({ message }: { message: string | null }) {
  if (!message) {
    return null;
  }

  return (
    <Text className="text-base leading-6 text-destructive">{message}</Text>
  );
}
