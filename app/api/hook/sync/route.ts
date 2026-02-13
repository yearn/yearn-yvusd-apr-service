import { NextResponse } from "next/server";
import { loadServiceConfig } from "@/lib/config";
import { initOnchainClients } from "@/lib/onchain";
import { syncAll } from "@/lib/strategy-store";

export const maxDuration = 120;

export async function POST() {
  try {
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

    const results = await syncAll(vaults, cacheConfig);

    const summary: Record<string, { strategies: number; last_block: number }> = {};
    for (const [key, entry] of Object.entries(results)) {
      summary[key] = {
        strategies: Object.keys(entry.strategies ?? {}).length,
        last_block: entry.last_block,
      };
    }

    return NextResponse.json({ ok: true, vaults: summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
