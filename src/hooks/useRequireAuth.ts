"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./useAuth";

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
  const isBypass =
    process.env.NEXT_PUBLIC_E2E_BYPASS_AUTH === '1' ||
    (typeof window !== 'undefined' && (
      new URLSearchParams(window.location.search).get('e2e') === '1' ||
      window.localStorage.getItem('E2E_BYPASS') === '1'
    ));

  // In E2E bypass, unblock onboarding form immediately regardless of auth state
  const isOnboardingPath = typeof window !== 'undefined' && window.location.pathname.startsWith('/onboarding');
  const isBypassOnOnboarding = isBypass && isOnboardingPath;

  useEffect(() => {
    // Skip redirects entirely when in bypass mode
    if (isBypass) return;
    if (loading) return;
    if (!user) {
      router.replace("/");
      return;
    }
    if (user && !family) {
      router.replace("/onboarding");
    }
  }, [loading, user, family, router, isBypass]);

  if (isBypass) return family ? "ready" : "needsOnboarding";
  if (loading) return "loading";
  if (!user) return "unauthenticated";
  if (user && !family) return "needsOnboarding";
  return "ready";
}


