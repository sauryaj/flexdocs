/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  reactStrictMode: true,
  compress: true,
  experimental: {
    serverActions: {
      bodySizeLimit: '5mb',
    },
  },
  serverExternalPackages: ['ssh2', 'dockerode'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
    ],
  },
};

module.exports = nextConfig;
