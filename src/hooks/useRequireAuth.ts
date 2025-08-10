"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./useAuth";
import { isE2EEnabled, ensureDefaultFamily, getFamily } from '@/lib/e2e';

export type AuthGuardStatus =
  | "loading"
  | "unauthenticated"
  | "needsOnboarding"
  | "ready";

/**
 * Centralized guard for protected pages.
 * Performs client-side redirects and returns a status the page can use
 * to decide what to render while navigation is happening.
 */
export function useRequireAuth(): AuthGuardStatus {
  const { user, family, loading } = useAuth();
  const router = useRouter();
  const isBypass = isE2EEnabled();

  // In E2E bypass, ensure default family and unblock onboarding if needed
  const isOnboardingPath = typeof window !== 'undefined' && window.location.pathname.startsWith('/onboarding');
  const isBypassOnOnboarding = isBypass && isOnboardingPath;

  useEffect(() => {
    // Skip redirects entirely when in bypass mode
    if (isBypass) {
      ensureDefaultFamily();
      return;
    }
    if (loading) return;
    if (!user) {
      router.replace("/");
      return;
    }
    if (user && !family) {
      router.replace("/onboarding");
    }
  }, [loading, user, family, router, isBypass]);

  if (isBypass) {
    const fam = family ?? getFamily();
    return fam ? "ready" : "needsOnboarding";
  }
  if (loading) return "loading";
  if (!user) return "unauthenticated";
  if (user && !family) return "needsOnboarding";
  return "ready";
}


