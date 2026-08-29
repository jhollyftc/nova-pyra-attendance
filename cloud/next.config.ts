import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // postgres.js opens raw sockets; keep it out of the bundler.
  serverExternalPackages: ["postgres"],
};

export default nextConfig;
