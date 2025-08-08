'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LoginPage } from '@/components/auth/LoginPage';
import { useAuth } from '@/hooks/useAuth';
import { useRedirectOnReady } from '@/hooks/useRedirectOnReady';
import type { AuthGuardStatus } from '@/hooks/useRequireAuth';

export default function HomePage() {
  const { user, parent, family, loading, signInWithGoogle } = useAuth();
  const router = useRouter();
  const [isInitialized, setIsInitialized] = useState(false);

  // Derive a guard-like status locally so we can reuse redirect helpers
  const status: AuthGuardStatus = useMemo(() => {
    if (loading) return 'loading';
    if (!user) return 'unauthenticated';
    if (user && !family) return 'needsOnboarding';
    return 'ready';
  }, [loading, user, family]);

  // Auto-leave the home/login page when fully ready
  useRedirectOnReady(status, '/dashboard');

  useEffect(() => {
    if (!loading) {
      setIsInitialized(true);
      if (user && !family) {
        // Authenticated but not onboarded: send to onboarding
        router.replace('/onboarding');
      }
    }
  }, [loading, user, family, router]);

  if (loading || !isInitialized) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading Bank o&apos;Bryan...</p>
        </div>
      </div>
    );
  }

  return <LoginPage onSignIn={signInWithGoogle} />;
}