import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Native gRPC (Tatum Sui gateway) must not be bundled; keep these as Node requires on the server.
  serverExternalPackages: ['@grpc/grpc-js', '@protobuf-ts/grpc-transport'],
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
