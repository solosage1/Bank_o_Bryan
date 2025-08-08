'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { supabase, signInWithGoogle as signInGoogle, signOut as signOutAuth } from '@/lib/supabase';
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
      await signInGoogle();
    } catch (error) {
      console.error('Sign in error:', error);
      throw error;
    }
  };

  const signOut = async () => {
    try {
      await signOutAuth();
      setUser(null);
      setParent(null);
      setFamily(null);
    } catch (error) {
      console.error('Sign out error:', error);
      throw error;
    }
  };

  const refreshProfile = async () => {
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
    // E2E bypass: provide a fake authenticated user to drive happy-path flows without real Supabase
    const isBypass =
      process.env.NEXT_PUBLIC_E2E_BYPASS_AUTH === '1' ||
      (typeof window !== 'undefined' &&
        (new URLSearchParams(window.location.search).get('e2e') === '1' ||
         window.localStorage.getItem('E2E_BYPASS') === '1'));

    if (isBypass) {
      const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
      if (pathname.startsWith('/onboarding')) {
        setUser({ id: 'e2e-user' } as unknown as User);
      } else {
        setUser(null);
      }
      setLoading(false);
      return;
    }

    // Get initial session
    const getInitialSession = async () => {
      try {
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

    return () => subscription.unsubscribe();
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