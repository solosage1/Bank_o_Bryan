// Apply SQL files to Supabase via Postgres Meta API using service role key
// Usage: node --env-file=.env.local tools/apply_sql_via_pg_meta.mjs <sql-file> [...more]

import fs from 'fs';
import path from 'path';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !service) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(2);
}

// Use Postgres Meta HTTP API exposed by Supabase
// https://supabase.com/docs/guides/platform/api
// Endpoint: POST {project-url}/postgres/v1/query  { query: string }
const pgMetaUrl = url.replace(/\/$/, '') + '/postgres/v1';

async function runSql(sql, label) {
  const res = await fetch(pgMetaUrl + '/query', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': service,
      'Authorization': `Bearer ${service}`,
    },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`SQL failed (${label}): ${res.status} ${res.statusText} -> ${text}`);
  }
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return parsed;
}

async function main() {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    console.error('Provide at least one .sql file path');
    process.exit(2);
  }
  const outPath = path.resolve(process.cwd(), 'analysis', 'supabase_sql_apply.log');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const logs = [];

  for (const file of files) {
    const abs = path.resolve(process.cwd(), file);
    const label = path.basename(abs);
    const sql = fs.readFileSync(abs, 'utf8');
    logs.push(`\n---- APPLY ${label} ----\n`);
    try {
      const result = await runSql(sql, label);
      logs.push(`OK ${label}: ${typeof result === 'string' ? result : 'applied'}`);
    } catch (e) {
      logs.push(`ERROR ${label}: ${e.message}`);
      // Stop on error to avoid cascading failures
      break;
    }
  }

  fs.writeFileSync(outPath, logs.join('\n'));
  console.log(logs.join('\n'));
}

main().catch((e) => {
  console.error(e?.message || String(e));
  process.exit(1);
});


