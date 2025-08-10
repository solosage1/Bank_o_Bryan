'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import type { Parent, Family, AuthContextType } from '@/types';
import { isE2EEnabled, ensureDefaultFamily, getFamily } from '@/lib/e2e';
import { queryClient } from '@/lib/queryClient';

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
          window.localStorage.removeItem('E2E_PARENT');
          window.localStorage.removeItem('E2E_FAMILY');
          window.localStorage.removeItem('E2E_CHILDREN');
          window.localStorage.removeItem('E2E_ACCOUNTS');
          window.localStorage.removeItem('E2E_TRANSACTIONS');
          window.localStorage.removeItem('E2E_TIERS');
          // Explicitly clear any cached timezone/name used by dashboard to avoid stale display on logout
          try { window.dispatchEvent(new Event('e2e-localstorage-updated')); } catch {}
        } catch (_) {
          // noop
        }
      }
      const mod = await import('@/lib/supabase');
      await mod.signOut();
      try { queryClient.clear(); } catch {}
      setUser(null);
      setParent(null);
      setFamily(null);
    } catch (error) {
      console.error('Sign out error:', error);
      throw error;
    }
  };

  const refreshProfile = async () => {
    const isBypass = isE2EEnabled();
    if (isBypass) {
      // Ensure defaults exist in E2E and hydrate from localStorage
      ensureDefaultFamily();
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
    const isBypass = isE2EEnabled();

    if (isBypass) {
      setUser({ id: 'e2e-user' } as unknown as User);
      ensureDefaultFamily();
      let onStorage: ((ev: StorageEvent) => void) | undefined;
      let onLocalSignal: (() => void) | undefined;
      const hydrate = () => {
        if (typeof window === 'undefined') return;
        const p = window.localStorage.getItem('E2E_PARENT');
        const f = window.localStorage.getItem('E2E_FAMILY');
        setParent(p ? JSON.parse(p) : null);
        setFamily(f ? JSON.parse(f) : null);
      };
      if (typeof window !== 'undefined') {
        try {
          hydrate();
          onStorage = (ev: StorageEvent) => {
            if (ev.key === 'E2E_PARENT' || ev.key === 'E2E_FAMILY') {
              hydrate();
            }
          };
          onLocalSignal = () => hydrate();
          window.addEventListener('storage', onStorage);
          window.addEventListener('e2e-localstorage-updated', onLocalSignal as EventListener);
        } catch (_) {}
      }
      setLoading(false);
      return () => {
        if (typeof window !== 'undefined') {
          if (onStorage) window.removeEventListener('storage', onStorage);
          if (onLocalSignal) window.removeEventListener('e2e-localstorage-updated', onLocalSignal as EventListener);
        }
      };
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