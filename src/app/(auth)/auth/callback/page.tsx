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

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          setErrorMessage(error.message);
          return;
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


