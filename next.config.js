const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === '1',
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: { unoptimized: true },
  // Ignore type errors during build to allow incremental refactoring
  typescript: {
    ignoreBuildErrors: true,
  },
  // Transpile problematic ESM packages for stable bundling
  transpilePackages: [
    '@supabase/supabase-js',
    'react-day-picker',
    'react-remove-scroll',
    'date-fns',
    'use-callback-ref',
    'react-style-singleton',
  ],
  experimental: {
    // Reduce bundle size by optimizing icon package imports
    // Disabled due to build instability in CI with Radix/ESM graph; re-enable after upgrade
    // optimizePackageImports: ['lucide-react'],
    esmExternals: 'loose',
  },
};

module.exports = withBundleAnalyzer(nextConfig);
