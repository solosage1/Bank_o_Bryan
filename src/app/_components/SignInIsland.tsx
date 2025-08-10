'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Icons } from '@/components/ui/icons';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import type { AuthGuardStatus } from '@/hooks/useRequireAuth';
type TrackArgs = Parameters<typeof import('@/components/analytics/track').track>;
const track = (...args: TrackArgs) => {
  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.log('[analytics]', ...args);
    return;
  }
  // Dynamically import only if needed in production
  import('@/components/analytics/track').then((mod: any) => (mod.track as (...a: TrackArgs) => void)(...args)).catch(() => {});
};

export default function SignInIsland(): JSX.Element {
  const { user, family, loading, signInWithGoogle } = useAuth();
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const status: AuthGuardStatus = useMemo(() => {
    if (loading) return 'loading';
    if (!user) return 'unauthenticated';
    if (user && !family) return 'needsOnboarding';
    return 'ready';
  }, [loading, user, family]);

  // Single redirect effect to avoid double navigation or flicker
  useEffect(() => {
    if (status === 'ready') {
      router.replace('/dashboard');
      return;
    }
    if (status === 'needsOnboarding') {
      track('projection_viewed', { note: 'root_redirect_to_onboarding' });
      router.replace('/onboarding');
    }
  }, [status, router]);

  const handleSignIn = async (): Promise<void> => {
    try {
      setIsSubmitting(true);
      await signInWithGoogle();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unable to start Google sign-in.';
      // Surface a user-visible error; common culprits: pop-up blocked or missing env vars
      toast({
        title: 'Sign-in failed',
        description: message || 'Please check your pop-up blocker and try again.',
        variant: 'destructive',
      });
      // eslint-disable-next-line no-console
      console.error('Sign-in initiation failed:', error);
    } finally {
      // If sign-in navigates away, this state won't matter; otherwise it re-enables the button
      setIsSubmitting(false);
    }
  };

  return (
    <Button
      type="button"
      onClick={handleSignIn}
      disabled={isSubmitting}
      size="lg"
      variant="google"
      className="w-full rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-white"
      aria-label="Continue with Google"
    >
      {isSubmitting ? (
        <div className="flex items-center space-x-2">
          <Icons.spinner className="w-5 h-5 animate-spin" aria-hidden="true" />
          <span>Signing in…</span>
        </div>
      ) : (
        <div className="flex items-center space-x-3">
          <Icons.googleGlyph className="w-5 h-5" aria-hidden="true" />
          <span>Continue with Google</span>
        </div>
      )}
    </Button>
  );
}


