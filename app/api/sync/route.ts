import { captureError, flushObservability } from "@/lib/observability";
import { NextRequest, NextResponse } from "next/server";
import { loadServiceConfig } from "@/lib/config";
import { initOnchainClients } from "@/lib/onchain";
import { syncAll } from "@/lib/strategy-store";
import { computeAllVaultsApr } from "@/lib/apr-service";
import { writeAprResult, clearCache } from "@/lib/redis";

export const maxDuration = 120;

async function sync(reset: boolean = false) {
  const config = loadServiceConfig();
  const onchainCfg = config.apr.sources.onchain ?? {};
  initOnchainClients(onchainCfg);

  const cacheConfig = config.apr.strategy_cache;
  const cacheVaults = cacheConfig.vaults ?? {};

  const vaults = config.apr.vaults
    .filter((v) => v.address.toLowerCase() in cacheVaults)
    .map((v) => ({
      address: v.address,
      chain_id: v.chain_id,
      symbol: v.symbol,
    }));

  if (reset) {
    await clearCache();
  }

  const results = await syncAll(vaults, cacheConfig);

  const summary: Record<string, { strategies: number; last_block: number }> = {};
  for (const [key, entry] of Object.entries(results)) {
    summary[key] = {
      strategies: Object.keys(entry.strategies ?? {}).length,
      last_block: entry.last_block,
    };
  }

  const aprResults = await computeAllVaultsApr(config.apr);
  await writeAprResult(aprResults as unknown as Record<string, unknown>);

  return { ok: true, vaults: summary, apr: aprResults };
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // Fail closed in production so wiping the Vercel env store cannot leave
    // /api/sync (including ?reset=true) publicly callable. Local dev skips auth.
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { error: "CRON_SECRET not configured" },
        { status: 500 },
      );
    }
  } else {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${secret}`) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  try {
    const reset = request.nextUrl.searchParams.get("reset") === "true";
    const result = await sync(reset);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    captureError(error);
    await flushObservability();
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
