import type { QueryKey } from '@tanstack/react-query';
import { DEFAULT_TIMEOUT_MS, TimeoutError } from '@/lib/queryClient';

export async function supabaseQueryFn<T>(
  _key: QueryKey,
  op: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<T> {
  const controller = new AbortController();
  const signal = controller.signal;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        try { controller.abort(); } catch {}
        reject(new TimeoutError());
      }, timeoutMs);
    });
    const result = await Promise.race([op(signal), timeout]);
    return result as T;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export { DEFAULT_TIMEOUT_MS } from '@/lib/queryClient';
export { TimeoutError, categorizeError, type FetchErrorCategory } from '@/lib/queryClient';


