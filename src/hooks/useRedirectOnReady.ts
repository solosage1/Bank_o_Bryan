"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { AuthGuardStatus } from "./useRequireAuth";

/**
 * Redirect to a target route whenever the auth guard status is "ready".
 * Use this on pages that should be inaccessible once a user is fully onboarded.
 */
export function useRedirectOnReady(status: AuthGuardStatus, target: string = "/dashboard"): void {
  const router = useRouter();

  useEffect(() => {
    if (status === "ready") {
      router.replace(target);
    }
  }, [status, target, router]);
}


