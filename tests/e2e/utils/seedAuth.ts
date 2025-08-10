import { createClient, type Session, type User } from '@supabase/supabase-js';

type SeedResult = {
  session: Session;
  projectRef: string;
};

function getEnv(name: string, required = true): string {
  const v = process.env[name];
  if (required && (!v || String(v).trim() === '')) {
    throw new Error(`Missing required env: ${name}`);
  }
  return v || '';
}

function getProjectRefFromUrl(urlString: string): string {
  const url = new URL(urlString);
  // abcdefghijklmnopqrst.supabase.co → projectRef = first label
  const host = url.hostname;
  const first = host.split('.')[0];
  return first;
}

export async function ensureUserAndSession(): Promise<SeedResult> {
  const supabaseUrl = getEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseAnonKey = getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  const serviceRole = getEnv('SUPABASE_SERVICE_ROLE_KEY');
  const email = getEnv('E2E_TEST_EMAIL');
  const password = getEnv('E2E_TEST_PASSWORD');

  const projectRef = getProjectRefFromUrl(supabaseUrl);

  // Admin client (service role) — Node only
  const admin = createClient(supabaseUrl, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Ensure user exists (idempotent)
  try {
    const { data: listed } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const exists = listed?.users?.some((u: User) => (u.email || '').toLowerCase() === email.toLowerCase());
    if (!exists) {
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
    }
  } catch (e) {
    // Fall back: attempt to create directly; ignore duplicate errors
    try {
      await admin.auth.admin.createUser({ email, password, email_confirm: true });
    } catch (_) {
      // ignore
    }
  }

  // Sign in using anon client to get a browser-compatible session
  const client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data?.session) {
    throw new Error(`Failed to sign in test user: ${error?.message || 'unknown error'}`);
  }

  return { session: data.session, projectRef };
}

export function buildStorageState(baseOrigin: string, projectRef: string, session: Session) {
  const key = `sb-${projectRef}-auth-token`;
  const value = JSON.stringify(session);
  return {
    cookies: [] as any[],
    origins: [
      {
        origin: baseOrigin,
        localStorage: [
          { name: key, value },
        ],
      },
    ],
  };
}

export async function ensureOnboarded(session: Session) {
  const supabaseUrl = getEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseAnonKey = getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  const serviceRole = getEnv('SUPABASE_SERVICE_ROLE_KEY');

  // Quick check via admin for existing parent/family
  const admin = createClient(supabaseUrl, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  try {
    const { data: parentRow } = await admin
      .from('parents')
      .select('id, family_id')
      .eq('auth_user_id', session.user.id)
      .maybeSingle();
    if (parentRow && parentRow.family_id) {
      return; // already onboarded
    }
  } catch (_) {
    // proceed to RPC path
  }

  // Call onboard_family as the user to let policies run correctly
  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  try {
    await userClient.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });
    // Name/timezone defaults safe for tests
    await userClient.rpc('onboard_family', {
      p_name: 'E2E QA Family',
      p_timezone: 'America/New_York',
    });
  } catch (_) {
    // Ignore if already onboarded or RPC unavailable; test will still proceed
  }

  // Verify again; if still missing, create via admin fallback
  try {
    const { data: parentRow } = await admin
      .from('parents')
      .select('id, family_id')
      .eq('auth_user_id', session.user.id)
      .maybeSingle();
    if (!parentRow || !parentRow.family_id) {
      // Create a family
      const { data: fam, error: famErr } = await admin
        .from('families')
        .insert({ name: 'E2E QA Family', timezone: 'America/New_York' })
        .select('id')
        .single();
      if (famErr) throw famErr;
      const familyId = (fam as any).id as string;

      // Upsert parent linking to family
      await admin
        .from('parents')
        .upsert({ auth_user_id: session.user.id, family_id: familyId }, { onConflict: 'auth_user_id' });
    }
  } catch (_) {
    // swallow; tests will still try to render settings
  }
}


