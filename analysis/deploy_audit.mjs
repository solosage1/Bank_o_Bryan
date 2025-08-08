import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'https://thunderous-bublanina-2eaf45.netlify.app/';
const OUT_DIR = path.resolve(process.cwd(), 'analysis');
const SCREENS_DIR = path.join(OUT_DIR, 'screens');

async function ensureDirs() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(SCREENS_DIR, { recursive: true });
}

async function audit() {
  await ensureDirs();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const consoleErrors = [];
  const failures = [];

  page.on('console', (msg) => {
    if (['error', 'warning'].includes(msg.type())) {
      consoleErrors.push(`[${msg.type()}] ${msg.text()}`);
    }
  });

  page.on('requestfailed', (req) => {
    failures.push(`${req.url()},${req.failure()?.errorText || 'failed'}`);
  });

  // Home
  await page.goto(BASE_URL, { waitUntil: 'load', timeout: 60000 });
  await page.screenshot({ path: path.join(SCREENS_DIR, 'home.png'), fullPage: true });

  // Try a few likely routes
  const routes = ['dashboard', 'child/placeholder', 'projection', 'playground', 'settings'];
  for (const r of routes) {
    const url = new URL(r, BASE_URL).toString();
    try {
      await page.goto(url, { waitUntil: 'load', timeout: 30000 });
      const safeName = r.replace(/[^a-z0-9_-]/gi, '_');
      await page.screenshot({ path: path.join(SCREENS_DIR, `${safeName}.png`), fullPage: true });
    } catch (e) {
      failures.push(`${url},navigation error`);
    }
  }

  fs.writeFileSync(path.join(OUT_DIR, 'deploy_console_log.txt'), consoleErrors.join('\n'));
  fs.writeFileSync(path.join(OUT_DIR, 'deploy_network_failures.csv'), 'URL,Reason\n' + failures.join('\n'));

  await browser.close();
}

audit().catch((e) => {
  console.error(e);
  process.exit(0);
});


