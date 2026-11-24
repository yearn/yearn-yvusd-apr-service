import fs from "fs";
import path from "path";
import type { NextConfig } from "next";

// Runtime config sourced from Doppler `prd`/`preview` at build time (see
// .github/workflows/cloudflare-deploy.yml). Listed vars are inlined into the
// build output so they are present at runtime. All are referenced
// server-side only, so they never reach the client bundle.
// CRON_SECRET is intentionally NOT inlined. It reaches the worker as a secret
// synced from Doppler. See README.
const INLINED_ENV = [
  "ETH_RPC_URL",
  "ARB_RPC_URL",
  "BASE_RPC_URL",
  "KAT_RPC_URL",
  "REDIS_URL",
  "KONG_WEBHOOK_SECRET",
  "YVUSD_ADDRESS",
  "LOCKED_YVUSD_ADDRESS",
  "SENTRY_DSN",
] as const;

// Only inline vars that are actually set, so code-level `|| default` fallbacks
// still apply when a var is absent (e.g. local dev).
const env = Object.fromEntries(
  INLINED_ENV.flatMap((k) => (process.env[k] ? [[k, process.env[k]!]] : [])),
);

// The Worker bundle has no filesystem access to config/config.yaml, so its
// contents are inlined at build time and read by lib/config.ts.
env.SERVICE_CONFIG_YAML = fs.readFileSync(
  path.join(process.cwd(), "config", "config.yaml"),
  "utf-8",
);

const nextConfig: NextConfig = {
  env,
  serverExternalPackages: ["ioredis"],
};

export default nextConfig;
