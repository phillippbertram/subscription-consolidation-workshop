import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './api-client';

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: (failureCount, error) => {
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
      mutations: { retry: false },
    },
  });
}
