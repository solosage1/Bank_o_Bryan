'use client';

import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Icons } from '@/components/ui/icons';
import { useAuth } from '@/hooks/useAuth';
import { useRedirectOnReady } from '@/hooks/useRedirectOnReady';
import type { AuthGuardStatus } from '@/hooks/useRequireAuth';
import { track } from '@/components/analytics/track';

export default function SignInIsland(): JSX.Element {
  const { user, family, loading, signInWithGoogle } = useAuth();
  const router = useRouter();

  const status: AuthGuardStatus = useMemo(() => {
    if (loading) return 'loading';
    if (!user) return 'unauthenticated';
    if (user && !family) return 'needsOnboarding';
    return 'ready';
  }, [loading, user, family]);

  useRedirectOnReady(status, '/dashboard');

  useEffect(() => {
    if (!loading && user && !family) {
      track('projection_viewed', { note: 'root_redirect_to_onboarding' });
      router.replace('/onboarding');
    }
  }, [loading, user, family, router]);

  const isLoading = loading;

  return (
    <Button
      type="button"
      onClick={() => signInWithGoogle()}
      disabled={isLoading}
      size="lg"
      variant="google"
      className="w-full rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-white"
    >
      {isLoading ? (
        <div className="flex items-center space-x-2">
          <Icons.spinner className="w-5 h-5 animate-spin" />
          <span>Preparing…</span>
        </div>
      ) : (
        <div className="flex items-center space-x-3">
          <Icons.googleGlyph className="w-5 h-5" />
          <span>Continue with Google</span>
        </div>
      )}
    </Button>
  );
}


