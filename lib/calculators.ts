import type { VaultConfig, StrategyConfig } from "./config";
import type { AprComponent } from "./models";
import { YvUsdAprEngine, aprToFloat } from "./apr-engine";
import { getErc4626Asset } from "./onchain";

type CalculatorFn = (
  vault: VaultConfig,
  strategy: StrategyConfig,
  engine: YvUsdAprEngine,
) => Promise<AprComponent[]>;

async function calculateYvusdBase(
  vault: VaultConfig,
  strategy: StrategyConfig,
  engine: YvUsdAprEngine,
): Promise<AprComponent[]> {
  const lockedVault = String(strategy.params?.locked_vault ?? "") || null;
  const delta = Number(strategy.params?.delta ?? 0) || 0;

  const [grossApr, netApr, feeConfig, strategyMeta] = await engine.getCustomExpectedApr(
    vault.address,
    lockedVault,
    vault.chain_id,
    delta,
  );

  if (netApr === null) return [];

  const meta: Record<string, unknown> = {
    strategy_id: strategy.id,
    apr_decimals: 18,
    gross_apr_raw: String(grossApr ?? 0n),
    net_apr_raw: String(netApr),
    strategies: strategyMeta,
  };
  if (feeConfig) {
    meta.management_fee_bps = feeConfig.managementFee;
    meta.performance_fee_bps = feeConfig.performanceFee;
    meta.locker_bonus_bps = feeConfig.lockerBonus;
  }

  return [
    {
      label: "net_apr",
      apr: aprToFloat(netApr),
      apy: 0,
      source: "onchain",
      meta,
    },
  ];
}

async function calculateLockedYvusd(
  vault: VaultConfig,
  strategy: StrategyConfig,
  engine: YvUsdAprEngine,
): Promise<AprComponent[]> {
  let baseVault = String(strategy.params?.base_vault ?? "") || null;
  const delta = Number(strategy.params?.delta ?? 0) || 0;

  if (!baseVault) {
    baseVault = await getErc4626Asset(vault.address, vault.chain_id);
  }
  if (!baseVault) return [];

  const [grossApr, netApr, feeConfig, strategyMeta] = await engine.getCustomExpectedApr(
    baseVault,
    vault.address,
    vault.chain_id,
    0,
  );
  const bonusApr = await engine.getLockedExpectedApr(
    baseVault,
    vault.address,
    vault.chain_id,
    delta,
  );

  const meta: Record<string, unknown> = {
    strategy_id: strategy.id,
    apr_decimals: 18,
    gross_apr_raw: String(grossApr ?? 0n),
    net_apr_raw: String(netApr ?? 0n),
    bonus_apr_raw: String(bonusApr ?? 0n),
    strategies: strategyMeta,
  };
  if (feeConfig) {
    meta.management_fee_bps = feeConfig.managementFee;
    meta.performance_fee_bps = feeConfig.performanceFee;
    meta.locker_bonus_bps = feeConfig.lockerBonus;
  }

  const components: AprComponent[] = [];
  if (netApr !== null) {
    components.push({
      label: "base_net_apr",
      apr: aprToFloat(netApr),
      apy: 0,
      source: "onchain",
      meta,
    });
  }
  components.push({
    label: "locker_bonus_apr",
    apr: aprToFloat(bonusApr),
    apy: 0,
    source: "onchain",
    meta,
  });
  return components;
}

const REGISTRY: Record<string, CalculatorFn> = {
  yvusd_base: calculateYvusdBase,
  locked_yvusd: calculateLockedYvusd,
};

export function getCalculator(type: string): CalculatorFn {
  const fn = REGISTRY[type];
  if (!fn) {
    console.warn(`Unknown strategy type: ${type} — skipping`);
    return async () => [];
  }
  return fn;
}
