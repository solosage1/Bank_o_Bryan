"use client";

import { useEffect } from 'react';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    const msg = error?.message ? error.message.slice(0, 300) : 'unknown error';
    // eslint-disable-next-line no-console
    console.error(`[settings] route error: ${msg}`);
  }, [error]);

  return (
    <main role="main" className="min-h-screen bg-gradient-to-br from-red-50 via-white to-red-50 flex items-center justify-center">
      <div className="text-center">
        <h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
        <p className="text-gray-600 mb-4">Please try again.</p>
        <button
          className="px-3 py-2 rounded-md border border-gray-300 text-gray-700 text-sm hover:bg-gray-50"
          onClick={() => reset()}
        >
          Retry
        </button>
      </div>
    </main>
  );
}


