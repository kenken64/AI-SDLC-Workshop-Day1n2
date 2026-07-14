import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // better-sqlite3 uses native bindings — exclude from bundling
  serverExternalPackages: ['better-sqlite3'],
};

export default nextConfig;
