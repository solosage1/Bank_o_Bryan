import { QueryCache, QueryClient } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';
import { isE2EEnabled } from '@/lib/e2e';

export const DEFAULT_TIMEOUT_MS: number = Number(
  process.env.NEXT_PUBLIC_REQUEST_TIMEOUT_MS || 6000
);

export type FetchErrorCategory = 'timeout' | 'offline' | 'client' | 'server' | 'unknown';

export class TimeoutError extends Error {
  constructor(message = 'Operation timed out') {
    super(message);
    this.name = 'TimeoutError';
  }
}

export function categorizeError(error: unknown): FetchErrorCategory {
  if (error instanceof TimeoutError) return 'timeout';
  if (typeof navigator !== 'undefined' && navigator && navigator.onLine === false) return 'offline';

  const anyErr = error as any;
  const status: number | undefined = anyErr?.status ?? anyErr?.statusCode ?? anyErr?.code;
  if (typeof status === 'number') {
    if (status >= 500) return 'server';
    if (status >= 400 && status < 500) return 'client';
  }
  return 'unknown';
}

export function backoffDelay(attempt: number): number {
  // attempt starts at 1
  const base = 500;
  return base * Math.pow(2, Math.max(0, attempt - 1));
}

export function createQueryClient(): QueryClient {
  const queryCache = new QueryCache({
    onError: (error, _query) => {
      const category = categorizeError(error);
      // Show a single toast for final failures; keep it generic but friendly
      const messageByCategory: Record<FetchErrorCategory, string> = {
        timeout: 'Request timed out. Please try again.',
        offline: 'You appear to be offline. Check your connection.',
        client: 'There was a problem with the request.',
        server: 'The server had a problem. Please retry shortly.',
        unknown: 'Something went wrong. Please retry.',
      };
      try {
        toast({ title: 'Request failed', description: messageByCategory[category], variant: 'destructive' as any });
      } catch {}
    },
  });

  const client = new QueryClient({
    queryCache,
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          const category = categorizeError(error);
          if (category === 'client') return false;
          if (category === 'offline') return false;
          if (category === 'server') return failureCount < 2;
          if (category === 'timeout') return isE2EEnabled() ? false : failureCount < 1;
          return failureCount < 1; // unknown: 1 retry
        },
        retryDelay: (attempt) => backoffDelay(attempt),
      },
      mutations: {
        retry: 0,
      },
    },
  });

  return client;
}

export const queryClient: QueryClient = createQueryClient();


