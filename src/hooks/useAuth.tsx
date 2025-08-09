'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import type { Parent, Family, AuthContextType } from '@/types';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [parent, setParent] = useState<Parent | null>(null);
  const [family, setFamily] = useState<Family | null>(null);
  const [loading, setLoading] = useState(true);

  const signInWithGoogle = async () => {
    try {
      // Helpful debug signal for single-click verification
      // eslint-disable-next-line no-console
      console.info('auth:signInWithGoogle invoked');
      const mod = await import('@/lib/supabase');
      await mod.signInWithGoogle();
    } catch (error) {
      console.error('Sign in error:', error);
      throw error;
    }
  };

  const signOut = async () => {
    try {
      // Ensure any local test bypass is cleared so real auth behavior is observed
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.removeItem('E2E_BYPASS');
        } catch (_) {
          // noop
        }
      }
      const mod = await import('@/lib/supabase');
      await mod.signOut();
      setUser(null);
      setParent(null);
      setFamily(null);
    } catch (error) {
      console.error('Sign out error:', error);
      throw error;
    }
  };

  const refreshProfile = async () => {
    const isBypass =
      process.env.NEXT_PUBLIC_E2E_BYPASS_AUTH === '1' ||
      (typeof window !== 'undefined' && (
        new URLSearchParams(window.location.search).get('e2e') === '1' ||
        window.localStorage.getItem('E2E_BYPASS') === '1'
      ));
    if (isBypass) {
      // Hydrate from localStorage in bypass mode ONLY if keys exist; otherwise leave nulls to allow onboarding
      if (typeof window !== 'undefined') {
        try {
          const storedParent = window.localStorage.getItem('E2E_PARENT');
          const storedFamily = window.localStorage.getItem('E2E_FAMILY');
          setParent(storedParent ? JSON.parse(storedParent) : null);
          setFamily(storedFamily ? JSON.parse(storedFamily) : null);
        } catch (e) {
          console.warn('bypass: failed to hydrate E2E_PARENT/E2E_FAMILY');
          setParent(null);
          setFamily(null);
        }
      }
      return;
    }
    if (!user) return;
    try {
      await fetchParentAndFamily(user.id);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error refreshing profile:', error);
    }
  };

  const fetchParentAndFamily = async (userId: string) => {
    try {
      const { supabase } = await import('@/lib/supabase');
      const { data: parentData, error: parentError } = await supabase
        .from('parents')
        .select(`
          *,
          families (*)
        `)
        .eq('auth_user_id', userId)
        .maybeSingle();

      if (parentError && parentError.code !== 'PGRST116') {
        throw parentError;
      }

      if (parentData) {
        setParent(parentData);
        setFamily(parentData.families);
      } else {
        setParent(null);
        setFamily(null);
      }
    } catch (error) {
      console.error('Error fetching parent and family:', error);
      setParent(null);
      setFamily(null);
    }
  };

  useEffect(() => {
    // E2E bypass: provide a fake authenticated user across all routes and hydrate parent/family from localStorage
    const isBypass =
      process.env.NEXT_PUBLIC_E2E_BYPASS_AUTH === '1' ||
      (typeof window !== 'undefined' &&
        (new URLSearchParams(window.location.search).get('e2e') === '1' ||
         window.localStorage.getItem('E2E_BYPASS') === '1'));

    // On the public home page, avoid initializing Supabase auth entirely to keep initial JS small
    // Auth-aware pages will still mount the provider and trigger initialization below.
    const isPublicHome = typeof window !== 'undefined' && window.location.pathname === '/';

    if (isBypass) {
      setUser({ id: 'e2e-user' } as unknown as User);
      if (typeof window !== 'undefined') {
        try {
          const storedParent = window.localStorage.getItem('E2E_PARENT');
          const storedFamily = window.localStorage.getItem('E2E_FAMILY');
          setParent(storedParent ? JSON.parse(storedParent) : null);
          setFamily(storedFamily ? JSON.parse(storedFamily) : null);
          const onStorage = (ev: StorageEvent) => {
            if (ev.key === 'E2E_PARENT' || ev.key === 'E2E_FAMILY') {
              const p = window.localStorage.getItem('E2E_PARENT');
              const f = window.localStorage.getItem('E2E_FAMILY');
              setParent(p ? JSON.parse(p) : null);
              setFamily(f ? JSON.parse(f) : null);
            }
          };
          window.addEventListener('storage', onStorage);
          return () => window.removeEventListener('storage', onStorage);
        } catch (_) {}
      }
      setLoading(false);
      return;
    }

    if (isPublicHome) {
      setLoading(false);
      return;
    }

    // Get initial session
    const getInitialSession = async () => {
      try {
        const { supabase } = await import('@/lib/supabase');
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) throw error;

        setUser(session?.user ?? null);
        if (session?.user) {
          await fetchParentAndFamily(session.user.id);
        }
      } catch (error) {
        console.error('Error getting initial session:', error);
      } finally {
        setLoading(false);
      }
    };

    getInitialSession();

    // Listen for auth changes
    let unsubscribe: (() => void) | undefined;
    (async () => {
      const { supabase } = await import('@/lib/supabase');
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        async (event, session) => {
          setUser(session?.user ?? null);

          if (event === 'SIGNED_IN' && session?.user) {
            await fetchParentAndFamily(session.user.id);
          } else if (event === 'SIGNED_OUT') {
            setParent(null);
            setFamily(null);
          }

          setLoading(false);
        }
      );
      unsubscribe = () => subscription.unsubscribe();
    })();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const value: AuthContextType = {
    user,
    parent,
    family,
    loading,
    signInWithGoogle,
    signOut,
    refreshProfile
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}