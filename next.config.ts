import type { NextConfig } from "next";

// Secrets are synced from 1Password into the Vercel project env by
// yearn-gha vercel-deploy (see .github/workflows/deploy.yml). Read them
// via process.env on the server. Do not list secrets under `env` here —
// next.config env force-inlines values and can leak into client assets.
const nextConfig: NextConfig = {
  serverExternalPackages: ["@envio-dev/hypersync-client", "ioredis"],
};

export default nextConfig;
