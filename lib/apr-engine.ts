import type { StrategyCacheConfig } from "./config";
import { getAddress } from "viem";
import {
  ONE,
  getVaultTotalSupply,
  getErc4626TotalAssets,
  getStrategyApr,
  getHistoricalConvertToAssetsApr,
  getOracleGrowthApr,
  getStrategyMarketId,
  getStrategyMorpho,
  getStrategyLeverageRatio,
  getStrategyPendleMarket,
  getStrategyPendleRouter,
  getPendleMarketImpliedApy,
  getPendleMarketApyFromApi,
  getMorphoMarketBorrowApy,
  fetchVaultAprData,
} from "./onchain";
import {
  getStrategyEntries,
  getStrategyConfig,
  type StrategyEntry,
} from "./strategy-store";

const MAX_BPS = 10_000;
const BPS_TO_APR = 10n ** 14n;

const OFFCHAIN_TYPES = new Set([
  "looper",
  "morpho-looper",
  "aave-looper",
  "pt-looper",
  "pt-morpho-looper",
  "pt-aave-looper",
  "pt",
]);

const MORPHO_LOOPER_TYPES = new Set(["morpho", "morpho-looper"]);
const MORPHO_STRATEGY_TYPES = new Set(["morpho-looper", "pt-morpho-looper"]);
const DEFAULT_HISTORICAL_WINDOW_SECONDS = 7 * 24 * 60 * 60;
const CHAIN_MORPHO_ADDRESSES: Record<number, string> = {
  1: "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb",
  137: "0x1bF0c2541F820E775182832f06c0B7Fc27A25f67",
  100: "0xce95AfbB8EA029495c66020883F87aaE8864AF92",
  8453: "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb",
  42161: "0x6c247b1F6182318877311737BaC0844bAa518F5e",
  747474: "0xD50F2DffFd62f94Ee4AEd9ca05C61d0753268aBc",
};

export interface FeeConfig {
  managementFee: number;
  performanceFee: number;
  lockerBonus: number;
  cooldownDuration: number;
  withdrawWindow: number;
}

type CustomResult = [bigint | null, bigint | null, FeeConfig | null, Record<string, unknown>[]];

export function aprToFloat(value: bigint): number {
  return Number(value) / Number(ONE);
}

function parseAprValue(
  cfg: Record<string, unknown>,
  rawKey: string,
  floatKey: string,
): bigint | null {
  if (rawKey in cfg) {
    return parseIntValue(cfg[rawKey]);
  }
  if (floatKey in cfg) {
    try {
      return BigInt(Math.round(Number(cfg[floatKey]) * Number(ONE)));
    } catch {
      return null;
    }
  }
  return null;
}

function parseIntValue(value: unknown): bigint | null {
  if (value === null || value === undefined) return null;
  try {
    return BigInt(value as string | number | bigint);
  } catch {
    return null;
  }
}

function pruneStrategyMeta(meta: Record<string, unknown>): Record<string, unknown> {
  const cleaned = { ...meta };
  delete cleaned.asset;
  return cleaned;
}

export class YvUsdAprEngine {
  private _cacheConfig: StrategyCacheConfig;
  private _customCache = new Map<string, CustomResult>();
  private _lockedCache = new Map<string, bigint>();
  private _customInflight = new Set<string>();

  constructor(cacheConfig: StrategyCacheConfig) {
    this._cacheConfig = cacheConfig;
  }

  private _cacheKey(vault: string, locked: string, chainId: number, delta: number): string {
    return `${vault.toLowerCase()}:${locked.toLowerCase()}:${chainId}:${delta}`;
  }

  async getCustomExpectedApr(
    vaultAddress: string,
    lockedVaultAddress: string | null,
    chainId: number,
    delta: number = 0,
  ): Promise<CustomResult> {
    const key = this._cacheKey(vaultAddress, lockedVaultAddress ?? "", chainId, delta);

    const cached = this._customCache.get(key);
    if (cached !== undefined) return cached;

    if (this._customInflight.has(key)) {
      return [null, null, null, []];
    }

    this._customInflight.add(key);
    try {
      const strategies = await getStrategyEntries(vaultAddress, chainId, this._cacheConfig);
      if (!strategies.length) {
        const result: CustomResult = [null, null, null, []];
        this._customCache.set(key, result);
        return result;
      }

      const strategyAddresses = strategies.map((s) => s.address);
      const batchData = await fetchVaultAprData(
        vaultAddress,
        strategyAddresses,
        lockedVaultAddress,
        chainId,
      );

      const totalAssets = batchData.totalAssets;
      if (totalAssets === 0n) {
        const result: CustomResult = [
          0n,
          0n,
          {
            managementFee: 0,
            performanceFee: 0,
            lockerBonus: 0,
            cooldownDuration: 0,
            withdrawWindow: 0,
          },
          [],
        ];
        this._customCache.set(key, result);
        return result;
      }

      let totalApr = 0n;
      const strategyMeta: Record<string, unknown>[] = [];

      for (const entry of strategies) {
        const addrKey = entry.address.toLowerCase();
        const currentDebt = batchData.strategyDebts.get(addrKey) ?? 0n;
        const debtChange = (BigInt(delta) * currentDebt) / totalAssets;

        let rawStrategyApr = 0n;
        let netStrategyApr = 0n;
        let weighted = 0n;

        const strategyType = String(entry.meta.type ?? "").toLowerCase().replace(/_/g, "-");
        const needsOffchain = OFFCHAIN_TYPES.has(strategyType) ||
          strategyType === "cross-chain" ||
          entry.apr_source === "offchain";

        let stratApr: bigint | null = null;
        if (needsOffchain) {
          stratApr = await this._getStrategyApr(entry, debtChange, chainId);
        } else {
          stratApr = batchData.strategyAprs.get(addrKey) ?? null;
          if (stratApr === null) {
            stratApr = await getStrategyApr(entry.address, debtChange, chainId);
          }
        }

        if (stratApr !== null) {
          rawStrategyApr = stratApr;
          netStrategyApr = rawStrategyApr;
          weighted = (rawStrategyApr * currentDebt) / totalAssets;
          totalApr += weighted;
        }

        strategyMeta.push({
          address: getAddress(entry.address),
          apr_source: entry.apr_source,
          offchain: entry.offchain,
          meta: pruneStrategyMeta(entry.meta),
          points: entry.points,
          apr_raw: String(rawStrategyApr),
          net_apr_raw: String(netStrategyApr),
          weighted_apr_raw: String(weighted),
          weight: Number(currentDebt) / Number(totalAssets),
          debt: String(currentDebt),
        });
      }

      const feeConfig = batchData.feeConfig ??
        {
          managementFee: 0,
          performanceFee: 0,
          lockerBonus: 0,
          cooldownDuration: 0,
          withdrawWindow: 0,
        };
      const netApr = this._applyLockedFees(totalApr, feeConfig);

      const result: CustomResult = [totalApr, netApr, feeConfig, strategyMeta];
      this._customCache.set(key, result);
      return result;
    } finally {
      this._customInflight.delete(key);
    }
  }

  async getLockedExpectedApr(
    vaultAddress: string,
    lockedVaultAddress: string,
    chainId: number,
    delta: number = 0,
  ): Promise<bigint> {
    const key = this._cacheKey(vaultAddress, lockedVaultAddress, chainId, delta);
    const cached = this._lockedCache.get(key);
    if (cached !== undefined) return cached;

    const [baseApr, , feeConfig] = await this.getCustomExpectedApr(
      vaultAddress,
      lockedVaultAddress,
      chainId,
      0,
    );
    if (!baseApr) {
      this._lockedCache.set(key, 0n);
      return 0n;
    }

    const totalYvusdShares = await getVaultTotalSupply(vaultAddress, chainId);
    if (totalYvusdShares === 0n) {
      this._lockedCache.set(key, 0n);
      return 0n;
    }

    let lockedShares = await getErc4626TotalAssets(lockedVaultAddress, chainId);
    lockedShares = lockedShares + BigInt(delta);
    if (lockedShares <= 0n) {
      this._lockedCache.set(key, 0n);
      return 0n;
    }

    const lockerBonusBps = feeConfig?.lockerBonus ?? 0;
    if (!lockerBonusBps) {
      this._lockedCache.set(key, 0n);
      return 0n;
    }

    const lockedRatio = (lockedShares * ONE) / totalYvusdShares;
    if (lockedRatio === 0n) {
      this._lockedCache.set(key, 0n);
      return 0n;
    }

    let bonusApr = (baseApr * BigInt(lockerBonusBps)) / BigInt(MAX_BPS);
    bonusApr = (bonusApr * ONE) / lockedRatio;

    this._lockedCache.set(key, bonusApr);
    return bonusApr;
  }

  private async _getStrategyApr(
    entry: StrategyEntry,
    debtChange: bigint,
    chainId: number,
  ): Promise<bigint | null> {
    const strategyType = String(entry.meta.type ?? "").toLowerCase().replace(/_/g, "-");

    if (OFFCHAIN_TYPES.has(strategyType)) {
      const offchainApr = await this._getOffchainStrategyApr(entry, chainId);
      if (offchainApr !== null && offchainApr !== 0n) return offchainApr;
    }

    if (strategyType === "cross-chain") {
      const remoteVault = String(entry.meta.remote_vault ?? "").trim();
      let remoteChainId: number | null = null;
      try {
        const raw = entry.meta.remote_chain_id;
        remoteChainId = raw !== null && raw !== undefined ? Number(raw) : null;
      } catch {
        remoteChainId = null;
      }

      if (remoteVault) {
        const remoteMeta = (entry.meta.remote_meta ?? {}) as Record<string, unknown>;
        let remoteType = String(
          entry.meta.remote_vault_type ?? (remoteMeta as Record<string, unknown>).type ?? "",
        ).toLowerCase().replace(/_/g, "-");

        const remoteCfg = getStrategyConfig(remoteVault, this._cacheConfig);
        const remoteEntry: StrategyEntry = {
          address: remoteVault,
          active: true,
          apr_source: String(remoteCfg.apr_source ?? "onchain").toLowerCase(),
          offchain: { ...(remoteCfg.offchain ?? {}) },
          meta: {
            ...(remoteCfg.meta ?? {}),
            ...remoteMeta,
            ...(remoteType ? { type: remoteType } : {}),
          },
          points: Boolean(remoteCfg.points ?? false),
        };

        const remotePreferOffchain = OFFCHAIN_TYPES.has(remoteType);
        if (remotePreferOffchain || remoteEntry.apr_source === "offchain") {
          const offchainApr = await this._getOffchainStrategyApr(
            remoteEntry,
            remoteChainId ?? chainId,
          );
          if (offchainApr !== null && offchainApr !== 0n) return offchainApr;
        }

        if (remoteChainId) {
          const remoteApr = await getStrategyApr(
            remoteVault,
            debtChange,
            remoteChainId,
          );
          if (remoteApr !== null) return remoteApr;
        }
      }
    }

    if (entry.apr_source === "offchain") {
      const offchainApr = await this._getOffchainStrategyApr(entry, chainId);
      if (offchainApr !== null && offchainApr !== 0n) return offchainApr;
    }

    return getStrategyApr(entry.address, debtChange, chainId);
  }

  private async _getOffchainStrategyApr(
    entry: StrategyEntry,
    chainId: number,
  ): Promise<bigint | null> {
    const cfg = { ...(entry.offchain ?? {}) };
    let mode = String(cfg.type ?? "").trim().toLowerCase().replace(/_/g, "-");
    const strategyType = String(entry.meta.type ?? "").trim().toLowerCase().replace(/_/g, "-");

    if (!mode && MORPHO_STRATEGY_TYPES.has(strategyType)) {
      mode = "morpho-looper";
    }
    if (!mode && strategyType === "pt") {
      mode = "pt-estimated";
    }

    if (mode === "static") {
      return parseAprValue(cfg, "apr_raw", "apr");
    }

    if (mode === "historical") {
      return this._getHistoricalOffchainApr(entry, chainId, cfg);
    }
    if (mode === "oracle-growth") {
      return this._getOracleGrowthOffchainApr(entry, chainId, cfg);
    }
    if (mode === "pt-estimated" || mode === "pt") {
      return this._getPtEstimatedOffchainApr(entry, chainId, cfg);
    }

    if (MORPHO_LOOPER_TYPES.has(mode)) {
      return this._getMorphoLooperOffchainApr(entry, chainId, cfg);
    }

    return null;
  }

  private async _getPtEstimatedOffchainApr(
    entry: StrategyEntry,
    chainId: number,
    cfg: Record<string, unknown>,
  ): Promise<bigint | null> {
    const ptToken = String(cfg.pt ?? cfg.pt_token ?? entry.meta.pt ?? "").trim();
    let apiApyRaw: bigint | null = null;

    let pendleRouter = String(cfg.pendle_router ?? entry.meta.pendle_router ?? "").trim();
    if (!pendleRouter) {
      pendleRouter = (await getStrategyPendleRouter(entry.address, chainId)) ?? "";
    }
    if (!pendleRouter && ptToken) {
      pendleRouter = (await getStrategyPendleRouter(ptToken, chainId)) ?? "";
    }
    if (!pendleRouter) return null;

    let pendleMarket = String(cfg.market ?? entry.meta.market ?? "").trim();
    if (!pendleMarket) {
      pendleMarket = (await getStrategyPendleMarket(entry.address, chainId)) ?? "";
    }
    if (!pendleMarket && ptToken) {
      pendleMarket = (await getStrategyPendleMarket(ptToken, chainId)) ?? "";
    }
    if (ptToken) {
      const api = await getPendleMarketApyFromApi(chainId, ptToken);
      if (!pendleMarket && api.market) {
        pendleMarket = api.market;
        entry.meta = { ...(entry.meta ?? {}), market: pendleMarket };
      }
      if (api.apyRaw !== null) {
        apiApyRaw = api.apyRaw;
      }
    }

    if (pendleMarket && pendleRouter) {
      const onchainApy = await getPendleMarketImpliedApy(pendleMarket, pendleRouter, chainId);
      if (onchainApy !== null) return onchainApy;
    }

    return apiApyRaw;
  }

  private async _getHistoricalOffchainApr(
    entry: StrategyEntry,
    chainId: number,
    cfg: Record<string, unknown>,
  ): Promise<bigint | null> {
    const address = String(cfg.address ?? entry.address ?? "").trim();
    if (!address) return null;

    let windowSeconds = parseIntValue(cfg.window_seconds);
    if (windowSeconds === null || windowSeconds <= 0n) {
      windowSeconds = BigInt(DEFAULT_HISTORICAL_WINDOW_SECONDS);
    }

    let sharesRaw = parseIntValue(cfg.shares_raw);
    if (sharesRaw === null || sharesRaw <= 0n) {
      sharesRaw = ONE;
    }

    return getHistoricalConvertToAssetsApr(address, chainId, Number(windowSeconds), sharesRaw);
  }

  private async _getOracleGrowthOffchainApr(
    entry: StrategyEntry,
    chainId: number,
    cfg: Record<string, unknown>,
  ): Promise<bigint | null> {
    const oracleAddress = String(cfg.oracle ?? "").trim();
    if (!oracleAddress) return null;

    let windowSeconds = parseIntValue(cfg.window_seconds);
    if (windowSeconds === null || windowSeconds <= 0n) {
      windowSeconds = BigInt(DEFAULT_HISTORICAL_WINDOW_SECONDS);
    }

    const apr = await getOracleGrowthApr(oracleAddress, chainId, Number(windowSeconds));
    if (apr !== null) return apr;

    // Fallback to static APR if provided and no history yet
    return parseAprValue(cfg, "fallback_apr_raw", "fallback_apr");
  }

  private async _getMorphoLooperOffchainApr(
    entry: StrategyEntry,
    chainId: number,
    cfg: Record<string, unknown>,
  ): Promise<bigint | null> {
    let collateralApr = parseAprValue(cfg, "collateral_apr_raw", "collateral_apr");
    if (collateralApr === null) {
      collateralApr = await this._getCollateralVaultApr(entry, chainId);
    }
    if (collateralApr === null) return null;

    let borrowApy = parseAprValue(cfg, "borrow_apy_raw", "borrow_apy");
    if (borrowApy === null) {
      borrowApy = await this._getMorphoBorrowApy(entry, chainId, cfg);
    }
    if (borrowApy === null) return null;

    const leverageRatio = await this._getStrategyLeverageRatio(entry, chainId, cfg);
    if (leverageRatio === null) return null;

    const leverage = leverageRatio > 0n ? leverageRatio : 0n;
    const borrowWeight = leverage > ONE ? leverage - ONE : 0n;

    const supplyComponent = (collateralApr * leverage) / ONE;
    const borrowComponent = (borrowApy * borrowWeight) / ONE;
    return supplyComponent - borrowComponent;
  }

  private async _getCollateralVaultApr(
    entry: StrategyEntry,
    chainId: number,
  ): Promise<bigint | null> {
    const meta = entry.meta ?? {};
    const collateral = meta.collateral as { address?: string } | undefined;
    if (!collateral || typeof collateral !== "object") return null;

    const collateralVault = String(collateral.address ?? "").trim();
    if (!collateralVault) return null;

    const hardcoded = await this._getAddressOverrideApr(collateralVault, chainId);
    if (hardcoded !== null) return hardcoded;

    const [, netApr] = await this.getCustomExpectedApr(collateralVault, null, chainId, 0);
    return netApr;
  }

  private async _getAddressOverrideApr(
    address: string,
    chainId: number,
  ): Promise<bigint | null> {
    const cfg = getStrategyConfig(address, this._cacheConfig);
    if (cfg.apr_source !== "offchain" || !cfg.offchain || !Object.keys(cfg.offchain).length) {
      return null;
    }

    const mode = String((cfg.offchain as Record<string, unknown>).type ?? "")
      .trim()
      .toLowerCase()
      .replace(/_/g, "-");
    if (MORPHO_LOOPER_TYPES.has(mode)) return null;

    const syntheticEntry: StrategyEntry = {
      address,
      active: true,
      apr_source: "offchain",
      offchain: { ...cfg.offchain },
      meta: { ...(cfg.meta ?? {}) },
      points: Boolean(cfg.points),
    };
    return this._getOffchainStrategyApr(syntheticEntry, chainId);
  }

  private async _getMorphoBorrowApy(
    entry: StrategyEntry,
    chainId: number,
    cfg: Record<string, unknown>,
  ): Promise<bigint | null> {
    let marketId = String(cfg.market_id ?? entry.meta.market_id ?? "").trim();
    let morpho = String(cfg.morpho ?? entry.meta.morpho ?? "").trim();

    if (!marketId) {
      marketId = (await getStrategyMarketId(entry.address, chainId)) ?? "";
    }
    if (!morpho) {
      morpho = (await getStrategyMorpho(entry.address, chainId)) ?? "";
    }
    if (!morpho) {
      morpho = CHAIN_MORPHO_ADDRESSES[chainId] ?? "";
    }
    if (!marketId || !morpho) return null;

    return getMorphoMarketBorrowApy(morpho, marketId, chainId);
  }

  private async _getStrategyLeverageRatio(
    entry: StrategyEntry,
    chainId: number,
    cfg: Record<string, unknown>,
  ): Promise<bigint | null> {
    const manual = parseIntValue(cfg.leverage_ratio_raw);
    if (manual !== null) return manual;
    return getStrategyLeverageRatio(entry.address, chainId);
  }

  private _applyLockedFees(grossApr: bigint, feeConfig: FeeConfig): bigint {
    const { managementFee, performanceFee, lockerBonus } = feeConfig;
    let netApr = grossApr;
    const feeCut = performanceFee + lockerBonus;
    if (feeCut) {
      netApr = (netApr * BigInt(MAX_BPS - feeCut)) / BigInt(MAX_BPS);
    }
    if (managementFee) {
      netApr = netApr - BigInt(managementFee) * BPS_TO_APR;
    }
    return netApr;
  }
}
