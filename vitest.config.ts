import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'react',
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
  },
  resolve: {
    alias: [
      { find: '@/components/ui', replacement: path.resolve(__dirname, './components/ui') },
      { find: '@/components/banking', replacement: path.resolve(__dirname, './src/components/banking') },
      { find: '@/components/analytics', replacement: path.resolve(__dirname, './src/components/analytics') },
      { find: '@/components', replacement: path.resolve(__dirname, './components') },
      { find: '@/app', replacement: path.resolve(__dirname, './src/app') },
      { find: '@/hooks', replacement: path.resolve(__dirname, './src/hooks') },
      { find: '@/hooks/use-toast', replacement: path.resolve(__dirname, './hooks/use-toast.ts') },
      { find: '@/lib/supabase', replacement: path.resolve(__dirname, './src/lib/supabase.ts') },
      { find: '@/lib/interest', replacement: path.resolve(__dirname, './src/lib/interest') },
      { find: '@/lib', replacement: path.resolve(__dirname, './lib') },
      { find: '@', replacement: path.resolve(__dirname, './src') },
    ],
  },
});


