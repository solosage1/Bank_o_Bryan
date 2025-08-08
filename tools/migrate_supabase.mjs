// Non-interactive Supabase migration/deploy script
// Usage: node tools/migrate_supabase.mjs

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const envPath = path.join(repoRoot, '.env.local')

function parseEnv(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8')
  const lines = raw.split(/\r?\n/)
  const out = {}
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx === -1) continue
    const key = trimmed.slice(0, idx).trim()
    let val = trimmed.slice(idx + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    out[key] = val
  }
  return out
}

function run(cmd, args, options = {}) {
  const res = spawnSync(cmd, args, { stdio: 'inherit', ...options })
  if (res.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} failed with code ${res.status}`)
  }
}

function deriveProjectRef(url) {
  try {
    const u = new URL(url)
    const host = u.host // e.g., smgovvcbpncfsujynzcq.supabase.co
    return host.split('.')[0]
  } catch {
    return ''
  }
}

async function main() {
  if (!fs.existsSync(envPath)) {
    throw new Error(`.env.local not found at ${envPath}`)
  }
  const env = parseEnv(envPath)
  const url = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || ''
  const token = env.SUPABASE_ACCESS_TOKEN || env.SUPABASE_TOKEN || ''
  const dbpass = env.SUPABASE_DB_PASSWORD || env.DB_PASSWORD || env.POSTGRES_PASSWORD || ''
  const ref = env.SUPABASE_PROJECT_REF || deriveProjectRef(url)

  if (!url) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) in .env.local')
  if (!token) throw new Error('Missing SUPABASE_ACCESS_TOKEN in .env.local')
  if (!dbpass) throw new Error('Missing DB password (SUPABASE_DB_PASSWORD/DB_PASSWORD/POSTGRES_PASSWORD) in .env.local')
  if (!ref || ref.length < 6) throw new Error('Missing SUPABASE_PROJECT_REF and could not derive from URL')

  // Login
  run('supabase', ['login', '--token', token], { cwd: repoRoot })
  // Link project (creates supabase/config.toml)
  run('supabase', ['link', '--project-ref', ref, '--password', dbpass], { cwd: repoRoot })
  // Push migrations
  run('supabase', ['db', 'push'], { cwd: repoRoot })
  // Deploy functions
  for (const fn of ['accrueInterest', 'projection', 'projectionWithSim']) {
    run('supabase', ['functions', 'deploy', fn, '--project-ref', ref], { cwd: repoRoot })
  }
  console.log('Supabase: link, migrations, and functions deploy completed successfully.')
}

main().catch((e) => {
  console.error(e.message || String(e))
  process.exit(1)
})


