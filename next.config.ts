import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ensure the correct project root when multiple lockfiles exist.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
