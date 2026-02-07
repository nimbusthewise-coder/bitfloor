import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Set basePath for Tailnet access via /bitfloor/
  // Local dev at localhost:3002 still works (assets load from root)
  basePath: "/bitfloor",
  assetPrefix: "/bitfloor",
};

export default nextConfig;
