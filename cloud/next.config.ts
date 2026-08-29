import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // postgres.js opens raw sockets; keep it out of the bundler.
  serverExternalPackages: ["postgres"],

  // Pin the workspace root to this directory.
  //
  // The kiosk app one level up has its own package-lock.json, so Next infers
  // the repo root as the workspace and traces files from there — dragging the
  // kiosk's electron and better-sqlite3 tree into a build that must not touch
  // it. Vercel builds with Root Directory = cloud, where that inference is
  // both wrong and invisible until the build fails.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
