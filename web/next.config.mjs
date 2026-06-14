/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // @kazi/shared is a workspace TS package consumed directly.
  transpilePackages: ["@kazi/shared"],
  experimental: {
    // @selfxyz/core has native deps (ethers, blake-hash); keep it external so
    // the serverless runtime loads it from node_modules instead of bundling.
    serverComponentsExternalPackages: ["@selfxyz/core"],
  },
};

export default nextConfig;
