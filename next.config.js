const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === '1',
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: { unoptimized: true },
  // Ignore type errors during build to allow incremental refactoring
  typescript: {
    ignoreBuildErrors: true,
  },
  experimental: {
    // Reduce bundle size by optimizing icon package imports
    optimizePackageImports: ['lucide-react'],
  },
};

module.exports = withBundleAnalyzer(nextConfig);
