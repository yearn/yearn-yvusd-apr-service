import type { AprConfig } from "./config";
import type { VaultAprResult } from "./models";
import { initOnchainClients, getErc4626Asset } from "./onchain";
import { YvUsdAprEngine } from "./apr-engine";
import { getCalculator } from "./calculators";

export async function computeAllVaultsApr(
  config: AprConfig,
): Promise<Record<string, VaultAprResult>> {
  initOnchainClients(config.sources.onchain ?? {});

  const engine = new YvUsdAprEngine(config.strategy_cache);
  const results: Record<string, VaultAprResult> = {};

  for (const vault of config.vaults) {
    const components = [];

    for (const strat of vault.strategies) {
      const calc = getCalculator(strat.type);
      const parts = await calc(vault, strat, engine);
      components.push(...parts);
    }

    const totalApr = components.reduce((sum, c) => sum + c.apr, 0);
    const payload: VaultAprResult = {
      name: vault.name,
      symbol: vault.symbol,
      address: vault.address,
      chain_id: vault.chain_id,
      apr: totalApr,
      components,
    };

    let strategiesMeta: unknown = null;
    for (const comp of payload.components) {
      if (comp.meta && "strategies" in comp.meta) {
        if (strategiesMeta === null) {
          strategiesMeta = comp.meta.strategies;
        }
        delete comp.meta.strategies;
      }
    }

    if (strategiesMeta && vault.symbol.toLowerCase() !== "lockedyvusd") {
      payload.meta = { ...(payload.meta ?? {}), strategies: strategiesMeta };
    }

    if (vault.symbol.toLowerCase() === "yvusd") {
      const asset = await getErc4626Asset(vault.address, vault.chain_id);
      if (asset) {
        payload.meta = { ...(payload.meta ?? {}), asset };
      }
    }

    results[vault.address] = payload;
  }

  return results;
}
