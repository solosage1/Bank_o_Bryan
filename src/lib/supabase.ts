import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';

// Read public env at build-time; avoid throwing during module init so the app can hydrate
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

// Export a readable flag that downstream code can use to avoid hanging on network calls
export const isSupabaseConfigured: boolean = Boolean(supabaseUrl && supabaseAnonKey);

if (!isSupabaseConfigured) {
  // Surface a readable console error but do not crash the client bundle
  // Netlify: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in site env
  // This allows the app to render and show the login/home even while backend is misconfigured
  // eslint-disable-next-line no-console
  console.error('Supabase is not configured. Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
}

export const supabase = createClient<Database>(
  supabaseUrl || 'https://invalid.supabase.co',
  supabaseAnonKey || 'invalid',
  {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  },
  realtime: {
    params: {
      eventsPerSecond: 2
    }
  }
  }
);

// Helper function to handle auth state changes
export const handleAuthStateChange = (callback: (session: any) => void) => {
  return supabase.auth.onAuthStateChange((event, session) => {
    callback(session);
  });
};

// Helper function to sign in with Google
export const signInWithGoogle = async () => {
  const isBypass =
    process.env.NEXT_PUBLIC_E2E_BYPASS_AUTH === '1' ||
    (typeof window !== 'undefined' && (
      new URLSearchParams(window.location.search).get('e2e') === '1' ||
      window.localStorage.getItem('E2E_BYPASS') === '1'
    ));

  if (isBypass) {
    // Simulate OAuth by navigating to a predictable provider-like URL for tests
    const origin = typeof window !== 'undefined' ? window.location.origin : (process.env.NEXT_PUBLIC_SITE_URL ?? '');
    const target = `${origin}/oauth/stub`;
    if (typeof window !== 'undefined') window.location.assign(target);
    return { provider: 'google', url: target } as any;
  }
  if (!isSupabaseConfigured) {
    throw new Error('Supabase is not configured. Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? (typeof window !== 'undefined' ? window.location.origin : '')}/auth/callback`,
      queryParams: {
        // Ensure Google shows the account chooser instead of silently reusing the existing session
        prompt: 'select_account'
      }
    }
  });
  if (error) throw error;
  return data;
};

// Helper function to sign out
export const signOut = async () => {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
};

// Helper function to get current session
export const getCurrentSession = async () => {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
};

// Helper function to get current user
export const getCurrentUser = async () => {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data.user;
};