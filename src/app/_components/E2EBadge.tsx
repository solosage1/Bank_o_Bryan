'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { clearE2ELocalData, disableE2E, disableE2EAndClear, isE2EEnabled } from '@/lib/e2e';
import { toast } from '@/hooks/use-toast';

export default function E2EBadge() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);

  const handleDisable = React.useCallback(() => {
    if (typeof window === 'undefined') return;
    try {
      // Client navigation to strip param softly when possible
      const url = new URL(window.location.href);
      if (url.searchParams.has('e2e')) {
        url.searchParams.delete('e2e');
        const nextHref = `${url.pathname}${url.searchParams.toString() ? `?${url.searchParams.toString()}` : ''}${url.hash || ''}`;
        router.replace(nextHref);
      }
    } catch {}
    try { disableE2E(); } catch {}
    toast({ title: 'E2E disabled' });
    // Fallback refresh in case history.replace didn’t trigger a full reload
    setTimeout(() => {
      try { if (typeof window !== 'undefined') window.location.reload(); } catch {}
    }, 250);
  }, [router]);

  const handleDisableAndClear = React.useCallback(() => {
    if (typeof window === 'undefined') return;
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has('e2e')) {
        url.searchParams.delete('e2e');
        const nextHref = `${url.pathname}${url.searchParams.toString() ? `?${url.searchParams.toString()}` : ''}${url.hash || ''}`;
        router.replace(nextHref);
      }
    } catch {}
    try { disableE2EAndClear(); } catch {
      // Fallback to explicit sequence
      try { clearE2ELocalData(); } catch {}
      try { disableE2E(); } catch {}
    }
    toast({ title: 'E2E disabled and local test data cleared' });
    setTimeout(() => {
      try { if (typeof window !== 'undefined') window.location.reload(); } catch {}
    }, 250);
  }, [router]);

  if (!isE2EEnabled()) return null;

  return (
    <div
      aria-label="E2E mode"
      className="fixed top-2 left-2 z-50 px-2.5 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 border border-yellow-300 shadow-sm select-none flex items-center gap-2"
    >
      <span>E2E mode</span>
      <div className="relative">
        <button
          type="button"
          aria-label="Disable E2E options"
          className="px-1.5 py-0.5 rounded border border-yellow-400 bg-white/70 text-yellow-900 hover:bg-white"
          onClick={() => setOpen(v => !v)}
        >
          •••
        </button>
        {open ? (
          <div className="absolute left-0 mt-1 w-48 rounded-md border border-yellow-300 bg-white shadow-md text-[11px] text-yellow-900">
            <button
              type="button"
              aria-label="Disable E2E"
              className="w-full text-left px-2 py-1 hover:bg-yellow-50"
              onClick={handleDisable}
            >
              Disable E2E
            </button>
            <button
              type="button"
              aria-label="Disable and clear local data"
              className="w-full text-left px-2 py-1 hover:bg-yellow-50 border-t border-yellow-200"
              onClick={handleDisableAndClear}
            >
              Disable & Clear local data
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}


