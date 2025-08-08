// Minimal Supabase connectivity and schema probe using env from .env.local
// Usage: node --env-file=.env.local tools/supabase_check.mjs

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || (!anon && !service)) {
  console.error('Missing Supabase envs: require NEXT_PUBLIC_SUPABASE_URL and one of NEXT_PUBLIC_SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(2);
}

const key = service || anon;
const supabase = createClient(url, key);

const tables = [
  'families',
  'parents',
  'children',
  'accounts',
  'interest_tiers',
  'transactions',
  'interest_runs',
  'goals',
  'rewards',
  'audit_log'
];

const results = [];

for (const t of tables) {
  try {
    const { data, error } = await supabase.from(t).select('*').limit(1);
    if (error) {
      results.push({ table: t, status: 'ERROR', message: error.message });
    } else {
      results.push({ table: t, status: 'OK', rowsFetched: Array.isArray(data) ? data.length : 0 });
    }
  } catch (e) {
    results.push({ table: t, status: 'EXCEPTION', message: e?.message || String(e) });
  }
}

const summary = {
  url,
  usedKey: service ? 'service_role' : 'anon',
  probedAt: new Date().toISOString(),
  results
};

const outDir = path.resolve(process.cwd(), 'analysis');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'supabase_check.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));


