'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function AuthCallbackPage() {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const completeSignIn = async (): Promise<void> => {
      try {
        // If session already exists (e.g., Supabase auto-detected from URL hash), leave immediately
        const { data: initial } = await supabase.auth.getSession();
        if (initial.session) {
          // Clean URL of any hash/query noise
          if (typeof window !== 'undefined') {
            window.history.replaceState({}, document.title, window.location.pathname);
          }
          router.replace('/dashboard');
          return;
        }

        const searchParams = new URLSearchParams(window.location.search);
        const providerError = searchParams.get('error_description') || searchParams.get('error');
        if (providerError) {
          setErrorMessage(providerError);
          return;
        }

        const code = searchParams.get('code');
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            setErrorMessage(error.message);
            return;
          }
          if (typeof window !== 'undefined') {
            window.history.replaceState({}, document.title, window.location.pathname);
          }
          router.replace('/dashboard');
          return;
        }

        // Implicit flow with hash params (#access_token=...)
        const hash = typeof window !== 'undefined' ? window.location.hash : '';
        if (hash && hash.startsWith('#')) {
          const hashParams = new URLSearchParams(hash.slice(1));
          const access_token = hashParams.get('access_token');
          const refresh_token = hashParams.get('refresh_token');
          if (access_token && refresh_token) {
            const { error } = await supabase.auth.setSession({ access_token, refresh_token });
            if (error) {
              setErrorMessage(error.message);
              return;
            }
            if (typeof window !== 'undefined') {
              window.history.replaceState({}, document.title, window.location.pathname);
            }
            router.replace('/dashboard');
            return;
          }
        }

        // Fallback: give Supabase a moment to auto-detect and then proceed or show a helpful error
        setTimeout(async () => {
          const { data } = await supabase.auth.getSession();
          if (data.session) {
            if (typeof window !== 'undefined') {
              window.history.replaceState({}, document.title, window.location.pathname);
            }
            router.replace('/dashboard');
          } else {
            setErrorMessage('Authentication timed out. Please try signing in again.');
          }
        }, 500);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Authentication failed';
        setErrorMessage(message);
      }
    };

    void completeSignIn();
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-gray-700 space-y-4 text-center">
        {errorMessage ? (
          <>
            <div>{`Authentication error: ${errorMessage}`}</div>
            <a
              href="/"
              className="inline-block text-blue-600 underline"
              aria-label="Return to sign-in"
            >
              Return to sign-in
            </a>
          </>
        ) : (
          'Finishing sign-in...'
        )}
      </div>
    </div>
  );
}


