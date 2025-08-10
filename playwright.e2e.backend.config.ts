import base from './playwright.config';
import type { PlaywrightTestConfig } from '@playwright/test';

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

const baseWebServer = Array.isArray((base as any).webServer)
  ? (base as any).webServer[0]
  : (base as any).webServer;

const config: PlaywrightTestConfig = {
  ...base,
  globalSetup: './playwright.global-setup.ts',
  // Exclude offline-tagged tests, but allow general and @backend tests
  grepInvert: /@offline/,
  webServer: ({
    ...(baseWebServer || {}),
    env: {
      ...((baseWebServer && baseWebServer.env) || {}),
      // Only pass through vars that actually exist; avoid forcing empty strings
      ...(process.env.NEXT_PUBLIC_SUPABASE_URL
        ? { NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL }
        : {}),
      ...(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        ? { NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY }
        : {}),
      ...(process.env.NEXT_PUBLIC_E2E_BYPASS_AUTH
        ? { NEXT_PUBLIC_E2E_BYPASS_AUTH: process.env.NEXT_PUBLIC_E2E_BYPASS_AUTH }
        : {}),
      NEXT_PUBLIC_SITE_URL: `http://localhost:${PORT}`,
    },
  } as any),
  use: {
    ...((base as any).use || {}),
    storageState: 'playwright/.auth/user.json',
  },
};

export default config;


