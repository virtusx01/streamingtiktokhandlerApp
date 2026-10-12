import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    'better-sqlite3',
    'pino',
    'jimp',
    'sharp',
  ],
};

export default nextConfig;
