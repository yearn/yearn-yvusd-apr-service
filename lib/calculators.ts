import type { VaultConfig, StrategyConfig } from "./config";
import type { AprComponent } from "./models";
import type { FeeConfig } from "./apr-engine";
import { YvUsdAprEngine, aprToFloat } from "./apr-engine";
import { getErc4626Asset } from "./onchain";

type CalculatorFn = (
  vault: VaultConfig,
  strategy: StrategyConfig,
  engine: YvUsdAprEngine,
) => Promise<AprComponent[]>;

function buildAprMeta(
  strategyId: string,
  grossApr: bigint | null,
  netApr: bigint,
  feeConfig: FeeConfig | null,
  strategyMeta: Record<string, unknown>[],
): Record<string, unknown> {
  const meta: Record<string, unknown> = {
    strategy_id: strategyId,
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
  return meta;
}

async function buildHeadlineNetAprComponent(
  strategyId: string,
  label: string,
  vaultAddress: string,
  lockedVaultAddress: string | null,
  chainId: number,
  delta: number,
  engine: YvUsdAprEngine,
): Promise<AprComponent | null> {
  const [grossApr, netApr, feeConfig, strategyMeta] = await engine.getCustomExpectedApr(
    vaultAddress,
    lockedVaultAddress,
    chainId,
    delta,
  );

  if (netApr === null) return null;

  return {
    label,
    apr: aprToFloat(netApr),
    apy: 0,
    source: "onchain",
    meta: buildAprMeta(strategyId, grossApr, netApr, feeConfig, strategyMeta),
  };
}

async function calculateYvusdBase(
  vault: VaultConfig,
  strategy: StrategyConfig,
  engine: YvUsdAprEngine,
): Promise<AprComponent[]> {
  const lockedVault = String(strategy.params?.locked_vault ?? "") || null;
  const delta = Number(strategy.params?.delta ?? 0) || 0;

  const component = await buildHeadlineNetAprComponent(
    strategy.id,
    "net_apr",
    vault.address,
    lockedVault,
    vault.chain_id,
    delta,
    engine,
  );

  return component ? [component] : [];
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

  const baseNetApr = await buildHeadlineNetAprComponent(
    strategy.id,
    "base_net_apr",
    baseVault,
    vault.address,
    vault.chain_id,
    delta,
    engine,
  );
  const bonusApr = await engine.getLockedExpectedApr(
    baseVault,
    vault.address,
    vault.chain_id,
    delta,
  );

  const bonusMeta: Record<string, unknown> = {
    strategy_id: strategy.id,
    apr_decimals: 18,
    bonus_apr_raw: String(bonusApr ?? 0n),
  };
  if (baseNetApr?.meta) {
    for (const key of [
      "gross_apr_raw",
      "net_apr_raw",
      "management_fee_bps",
      "performance_fee_bps",
      "locker_bonus_bps",
    ]) {
      if (key in baseNetApr.meta) {
        bonusMeta[key] = baseNetApr.meta[key];
      }
    }
  }

  const components: AprComponent[] = [];
  if (baseNetApr) components.push(baseNetApr);
  components.push({
    label: "locker_bonus_apr",
    apr: aprToFloat(bonusApr),
    apy: 0,
    source: "onchain",
    meta: bonusMeta,
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
