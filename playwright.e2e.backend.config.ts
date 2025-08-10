import base from './playwright.config';
import type { PlaywrightTestConfig } from '@playwright/test';

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

const baseWebServer = Array.isArray((base as any).webServer)
  ? (base as any).webServer[0]
  : (base as any).webServer;

const config: PlaywrightTestConfig = {
  ...base,
  // Exclude offline-tagged tests, but allow general and @backend tests
  grepInvert: /@offline/,
  webServer: ({
    ...(baseWebServer || {}),
    env: {
      ...((baseWebServer && baseWebServer.env) || {}),
      // Do not set E2E toggles here.
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
      NEXT_PUBLIC_SITE_URL: `http://localhost:${PORT}`,
    },
  } as any),
};

export default config;


