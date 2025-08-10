import base from './playwright.config';
import type { PlaywrightTestConfig } from '@playwright/test';

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

const baseWebServer = Array.isArray((base as any).webServer)
  ? (base as any).webServer[0]
  : (base as any).webServer;

const config: PlaywrightTestConfig = {
  ...base,
  // Run only tests tagged @offline to make intent explicit
  grep: /@offline/,
  webServer: ({
    ...(baseWebServer || {}),
    env: {
      ...((baseWebServer && baseWebServer.env) || {}),
      NEXT_PUBLIC_E2E: '1',
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://example.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'test_anon_key',
      NEXT_PUBLIC_SITE_URL: `http://localhost:${PORT}`,
    },
  } as any),
};

export default config;


