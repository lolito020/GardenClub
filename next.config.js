/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  images: { unoptimized: true },
  experimental: { serverActions: { bodySizeLimit: '10mb' } }
};
module.exports = nextConfig;