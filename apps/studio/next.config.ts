import type { NextConfig } from "next";
import path from "node:path";

const config: NextConfig = {
  transpilePackages: ["@stencil/shared", "@stencil/studio"],
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  turbopack: {
    root: path.resolve(import.meta.dirname, "../.."),
  },
  images: { unoptimized: true },
  typescript: { ignoreBuildErrors: false },
};

export default config;
