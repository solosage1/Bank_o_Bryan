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

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/");
      return;
    }
    if (user && !family) {
      router.replace("/onboarding");
    }
  }, [loading, user, family, router]);

  if (loading) return "loading";
  if (!user) return "unauthenticated";
  if (user && !family) return "needsOnboarding";
  return "ready";
}


