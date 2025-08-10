'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { clearE2ELocalData, disableE2E, disableE2EAndClear, isE2EEnabled } from '@/lib/e2e';
import { toast } from '@/hooks/use-toast';

export default function E2EBadge() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);

  // Helper to synchronously strip ?e2e=1 from the URL
  const stripE2EParam = React.useCallback((): boolean => {
    if (typeof window === 'undefined') return false;
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has('e2e')) {
        url.searchParams.delete('e2e');
        const nextHref = `${url.pathname}${url.searchParams.toString() ? `?${url.searchParams.toString()}` : ''}${url.hash || ''}`;
        window.history.replaceState(null, '', nextHref);
        return true;
      }
    } catch {}
    return false;
  }, []);

  // Strip ?e2e=1 on mount to avoid leaking the flag in address bar
  React.useEffect(() => { stripE2EParam(); }, [stripE2EParam]);

  const handleDisable = React.useCallback(() => {
    if (typeof window === 'undefined') return;
    try { stripE2EParam(); } catch {}
    try { disableE2E(); } catch {}
    toast({ title: 'E2E disabled' });
    try {
      requestAnimationFrame(() => {
        setTimeout(() => { try { window.location.reload(); } catch {} }, 50);
      });
    } catch {
      setTimeout(() => { try { window.location.reload(); } catch {} }, 100);
    }
  }, [stripE2EParam]);

  const handleDisableAndClear = React.useCallback(() => {
    if (typeof window === 'undefined') return;
    try { stripE2EParam(); } catch {}
    try { disableE2EAndClear(); } catch {
      try { clearE2ELocalData(); } catch {}
      try { disableE2E(); } catch {}
    }
    toast({ title: 'E2E disabled and local test data cleared' });
    try {
      requestAnimationFrame(() => {
        setTimeout(() => { try { window.location.reload(); } catch {} }, 50);
      });
    } catch {
      setTimeout(() => { try { window.location.reload(); } catch {} }, 100);
    }
  }, [stripE2EParam]);

  if (!isE2EEnabled()) return null;

  return (
    <div
      aria-label="E2E mode"
      className="fixed top-2 left-2 z-50 px-2.5 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 border border-yellow-300 shadow-sm select-none flex items-center gap-2"
    >
      <span>E2E mode</span>
      <div className="relative">
        {open ? (
          <button
            type="button"
            aria-label="Disable E2E options"
            id="e2e-menu-button"
            aria-haspopup="menu"
            aria-controls="e2e-menu"
            aria-expanded="true"
            className="px-1.5 py-0.5 rounded border border-yellow-400 bg-white/70 text-yellow-900 hover:bg-white"
            onClick={() => setOpen(false)}
          >
            •••
          </button>
        ) : (
          <button
            type="button"
            aria-label="Disable E2E options"
            id="e2e-menu-button"
            aria-haspopup="menu"
            aria-controls="e2e-menu"
            aria-expanded="false"
            className="px-1.5 py-0.5 rounded border border-yellow-400 bg-white/70 text-yellow-900 hover:bg-white"
            onClick={() => setOpen(true)}
          >
            •••
          </button>
        )}
        {open ? (
          <div id="e2e-menu" role="menu" aria-labelledby="e2e-menu-button" className="absolute left-0 mt-1 w-48 rounded-md border border-yellow-300 bg-white shadow-md text-[11px] text-yellow-900">
            <button
              type="button"
              aria-label="Disable E2E"
              role="menuitem"
              className="w-full text-left px-2 py-1 hover:bg-yellow-50"
              onClick={handleDisable}
            >
              Disable E2E
            </button>
            <button
              type="button"
              aria-label="Disable and clear local data"
              role="menuitem"
              className="w-full text-left px-2 py-1 hover:bg-yellow-50 border-t border-yellow-200"
              onClick={handleDisableAndClear}
            >
              Disable and clear local data
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}


