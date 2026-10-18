import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './api-client';

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // These tune refetching and memory use, not how long Premium is valid.
        // The dashboard separately expires the backend's access snapshot.
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: (failureCount, error) => {
          // Retry only transient read failures. Repeating a permission denial
          // or invalid response cannot repair it and would delay useful feedback.
          if (failureCount >= 2 || !(error instanceof ApiError)) {
            return false;
          }

          return (
            error.code === 'network_error' ||
            error.code === 'timeout' ||
            (error.code === 'http_error' &&
              (error.status === 429 || (error.status ?? 0) >= 500))
          );
        },
      },
      // A failed response may hide a completed write. Each mutation needs an
      // explicit recovery/idempotency strategy before automatic retries are safe.
      mutations: { retry: false },
    },
  });
}
