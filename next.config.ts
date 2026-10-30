import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Native gRPC (Tatum Sui gateway) must not be bundled; keep these as Node requires on the server.
  serverExternalPackages: ['@grpc/grpc-js', '@protobuf-ts/grpc-transport'],
  // Vercel deployment: the arena (worker + database) lives on the always-on server; the Vercel site
  // serves the pages and forwards every /api call there. Set ARENA_API_ORIGIN=https://<server> on Vercel.
  async rewrites() {
    const origin = process.env.ARENA_API_ORIGIN;
    return origin ? { beforeFiles: [{ source: '/api/:path*', destination: `${origin}/api/:path*` }], afterFiles: [], fallback: [] } : [];
  },
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
};

export default nextConfig;
