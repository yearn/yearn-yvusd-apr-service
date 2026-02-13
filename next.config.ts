import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@envio-dev/hypersync-client", "ioredis"],
};

export default nextConfig;
