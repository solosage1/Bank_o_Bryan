'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function AuthCallbackPage() {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const completeSignIn = async () => {
      const searchParams = new URLSearchParams(window.location.search);
      const code = searchParams.get('code');
      const providerError = searchParams.get('error_description') || searchParams.get('error');

      if (providerError) {
        setErrorMessage(providerError);
        return;
      }

      // Case 1: PKCE flow with code param
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          setErrorMessage(error.message);
          return;
        }
      } else {
        // Case 2: Implicit flow with hash params (#access_token=...)
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
          }
        }
      }

      router.replace('/');
    };

    void completeSignIn();
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-gray-700">
        {errorMessage ? `Authentication error: ${errorMessage}` : 'Finishing sign-in...'}
      </div>
    </div>
  );
}


