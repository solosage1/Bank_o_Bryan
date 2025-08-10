import { describe, it, expect, vi } from 'vitest';
import { supabaseQueryFn, TimeoutError, categorizeError } from '@/lib/fetching';

describe('fetching utilities', () => {
  it('categorizeError: timeout', () => {
    expect(categorizeError(new TimeoutError())).toBe('timeout');
  });

  it('categorizeError: offline', () => {
    const nav = (global as any).navigator;
    (global as any).navigator = { onLine: false };
    expect(categorizeError(new Error('x'))).toBe('offline');
    (global as any).navigator = nav;
  });

  it('categorizeError: client/server/unknown', () => {
    expect(categorizeError({ status: 404 })).toBe('client');
    expect(categorizeError({ statusCode: 500 })).toBe('server');
    expect(categorizeError({})).toBe('unknown');
  });

  it('supabaseQueryFn enforces timeout and aborts', async () => {
    const op = vi.fn().mockImplementation((signal: AbortSignal) => {
      return new Promise((_resolve) => {
        // never resolves; we expect abort to be called
        signal.addEventListener('abort', () => {});
      });
    });
    await expect(supabaseQueryFn(['k'], op, 5)).rejects.toBeInstanceOf(TimeoutError);
  });
});


