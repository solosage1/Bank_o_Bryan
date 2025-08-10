/// <reference types="node" />
import { ensureUserAndSession, buildStorageState, ensureOnboarded } from './tests/e2e/utils/seedAuth';
import fs from 'fs';
import path from 'path';

async function globalSetup() {
  const baseURL = process.env.BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  const { session, projectRef } = await ensureUserAndSession();
  await ensureOnboarded(session);
  const storage = buildStorageState(baseURL, projectRef, session);

  const outDir = path.join(process.cwd(), 'playwright', '.auth');
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, 'user.json');
  fs.writeFileSync(file, JSON.stringify(storage, null, 2), 'utf8');
}

export default globalSetup;


