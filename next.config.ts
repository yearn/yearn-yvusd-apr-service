import type { NextConfig } from "next";

// Runtime config sourced from 1Password and injected at `vercel build` time
// (see .github/workflows/deploy.yml). Listed vars are inlined into the build
// output so nothing has to live in Vercel's env store. All are referenced
// server-side only, so they never reach the client bundle.
// Note: CRON_SECRET is intentionally NOT here — Vercel's cron scheduler signs
// requests from its own env store, so deploy.yml pushes it into Vercel instead.
const INLINED_ENV = [
  "ETH_RPC_URL",
  "ARB_RPC_URL",
  "BASE_RPC_URL",
  "KAT_RPC_URL",
  "REDIS_URL",
  "HYPERSYNC_API_TOKEN",
  "KONG_WEBHOOK_SECRET",
  "YVUSD_ADDRESS",
  "LOCKED_YVUSD_ADDRESS",
] as const;

// Only inline vars that are actually set, so code-level `|| default` fallbacks
// still apply when a var is absent (e.g. local dev).
const env = Object.fromEntries(
  INLINED_ENV.flatMap((k) => (process.env[k] ? [[k, process.env[k]!]] : [])),
);

const nextConfig: NextConfig = {
  env,
  serverExternalPackages: ["@envio-dev/hypersync-client", "ioredis"],
};

export default nextConfig;
