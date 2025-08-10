'use client';

import { isE2EEnabled } from '@/lib/e2e';

export default function E2EBadge() {
  if (!isE2EEnabled()) return null;
  return (
    <div
      aria-label="E2E mode"
      className="fixed top-2 left-2 z-50 px-2.5 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 border border-yellow-300 shadow-sm select-none"
    >
      E2E mode
    </div>
  );
}


