/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // @kazi/shared is a workspace TS package consumed directly.
  transpilePackages: ["@kazi/shared"],
};

export default nextConfig;
