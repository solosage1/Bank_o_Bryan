/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: { unoptimized: true },
  // Ignore type errors during build to allow incremental refactoring
  typescript: {
    ignoreBuildErrors: true,
  },
};

module.exports = nextConfig;
