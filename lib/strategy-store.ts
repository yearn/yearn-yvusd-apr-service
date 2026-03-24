import { fetchStrategyChangedEvents, type StrategyChangedEvent } from "./hypersync";
import { getContractName, getStrategyMetadata, getLatestBlock } from "./onchain";
import { readCache, writeCache } from "./redis";
import type { StrategyCacheConfig } from "./config";

export interface StrategyEntry {
  address: string;
  active: boolean;
  apr_source: string;
  offchain: Record<string, unknown>;
  meta: Record<string, unknown>;
  points: boolean;
}

interface StrategyRecord {
  address: string;
  active: boolean;
  apr_source: string;
  offchain: Record<string, unknown>;
  meta: Record<string, unknown>;
  points: boolean;
  onchain_loaded: boolean;
}

interface VaultEntry {
  chain_id: number;
  vault: string;
  vault_name?: string;
  strategies: Record<string, StrategyRecord>;
  last_block: number;
  updated_at: number;
}

type CacheData = Record<string, VaultEntry>;

interface CacheConfig {
  start_block: number;
  chunk_size: number;
  defaults: Record<string, unknown>;
  hardcoded_aprs: Record<string, unknown>;
  strategies: Record<string, unknown>;
  chains: Record<string, { start_block?: number }>;
  vaults: Record<string, { start_block?: number }>;
}

interface VaultRef {
  address: string;
  chain_id: number;
  symbol?: string;
}

const LOOPER_TYPES = new Set([
  "looper",
  "morpho-looper",
  "aave-looper",
  "pt-looper",
  "pt-morpho-looper",
  "pt-aave-looper",
]);

function vaultKey(address: string, chainId: number): string {
  return `${chainId}:${address.toLowerCase()}`;
}

function normalizeEntry(entry: Record<string, unknown>): VaultEntry {
  let strategies = entry.strategies;
  if (Array.isArray(strategies)) {
    const normalized: Record<string, StrategyRecord> = {};
    for (const item of strategies) {
      if (typeof item === "object" && item !== null && (item as Record<string, unknown>).address) {
        const addr = String((item as Record<string, unknown>).address).toLowerCase();
        normalized[addr] = item as StrategyRecord;
      }
    }
    strategies = normalized;
  } else if (typeof strategies !== "object" || strategies === null) {
    strategies = {};
  }
  return {
    chain_id: Number(entry.chain_id ?? 0),
    vault: String(entry.vault ?? ""),
    vault_name: entry.vault_name as string | undefined,
    strategies: strategies as Record<string, StrategyRecord>,
    last_block: Number(entry.last_block ?? 0),
    updated_at: Number(entry.updated_at ?? 0),
  };
}

function buildHardcodedOffchainConfig(
  value: unknown,
): Record<string, unknown> {
  if (value === null || value === undefined) return {};
  if (typeof value === "object" && !Array.isArray(value)) {
    const v = value as Record<string, unknown>;
    const mode = String(v.type ?? "").trim().toLowerCase().replace(/_/g, "-");
    if (mode === "" || mode === "offchain" || mode === "static") {
      if ("apr_raw" in v) return { type: "static", apr_raw: v.apr_raw };
      if ("apr" in v) return { type: "static", apr: v.apr };
    }
    if (mode === "historical") {
      const cfg: Record<string, unknown> = { type: "historical" };
      for (const key of ["address", "window_seconds", "shares_raw"]) {
        if (key in v) cfg[key] = v[key];
      }
      return cfg;
    }
    if (mode === "oracle-growth") {
      const cfg: Record<string, unknown> = { type: "oracle-growth" };
      for (const key of ["oracle", "window_seconds", "fallback_apr", "fallback_apr_raw"]) {
        if (key in v) cfg[key] = v[key];
      }
      return cfg;
    }
    if (mode) {
      return { ...v, type: mode };
    }
    return {};
  }
  return { type: "static", apr: value };
}

function strategyConfig(
  address: string,
  defaults: Record<string, unknown>,
  strategyOverrides: Record<string, Record<string, unknown>>,
  hardcodedAprs: Record<string, unknown>,
): {
  apr_source: string;
  offchain: Record<string, unknown>;
  meta: Record<string, unknown>;
  points: boolean;
} {
  const cfg = { ...defaults };
  const override = strategyOverrides[address.toLowerCase()] ?? {};
  const meta: Record<string, unknown> = {
    ...(typeof cfg.meta === "object" && cfg.meta !== null ? cfg.meta : {}),
  };
  const overrideMeta = override.meta;
  if (typeof overrideMeta === "object" && overrideMeta !== null) {
    Object.assign(meta, overrideMeta);
  }
  Object.assign(cfg, override);
  cfg.meta = meta;

  const hardcoded = hardcodedAprs[address.toLowerCase()];
  const offchainCfg = buildHardcodedOffchainConfig(hardcoded);
  if (Object.keys(offchainCfg).length > 0) {
    cfg.apr_source = "offchain";
    cfg.offchain = offchainCfg;
  }

  return {
    apr_source: String(cfg.apr_source ?? "onchain").toLowerCase(),
    offchain: typeof cfg.offchain === "object" && cfg.offchain !== null
      ? (cfg.offchain as Record<string, unknown>)
      : {},
    meta: typeof cfg.meta === "object" && cfg.meta !== null
      ? (cfg.meta as Record<string, unknown>)
      : {},
    points: Boolean(cfg.points ?? false),
  };
}

function newStrategyRecord(
  address: string,
  defaults: Record<string, unknown>,
  strategyOverrides: Record<string, Record<string, unknown>>,
  hardcodedAprs: Record<string, unknown>,
): StrategyRecord {
  const config = strategyConfig(address, defaults, strategyOverrides, hardcodedAprs);
  return {
    address,
    active: true,
    apr_source: config.apr_source,
    offchain: config.offchain,
    meta: config.meta,
    points: config.points,
    onchain_loaded: false,
  };
}

function applyEvent(
  entry: VaultEntry,
  event: StrategyChangedEvent,
  defaults: Record<string, unknown>,
  strategyOverrides: Record<string, Record<string, unknown>>,
  hardcodedAprs: Record<string, unknown>,
): void {
  const key = event.strategy.toLowerCase();
  if (event.changeType === 0 || event.changeType === 1) {
    if (!entry.strategies[key]) {
      entry.strategies[key] = newStrategyRecord(
        event.strategy,
        defaults,
        strategyOverrides,
        hardcodedAprs,
      );
    }
    entry.strategies[key].active = true;
  } else if (event.changeType === 2) {
    if (entry.strategies[key]) {
      entry.strategies[key].active = false;
    }
  }
}

async function hydrateOnchainMetadata(entry: VaultEntry): Promise<void> {
  if (!entry.vault_name && entry.vault && entry.chain_id) {
    const name = await getContractName(entry.vault, entry.chain_id);
    entry.vault_name = name ?? entry.vault;
  }

  if (!entry.chain_id) return;

  function shouldRefreshStrategyMetadata(item: StrategyRecord): boolean {
    if (!item.onchain_loaded) return true;

    const meta = item.meta ?? {};
    const strategyType = String(meta.type ?? "").toLowerCase().replace(/_/g, "-");
    if (!strategyType || strategyType === "default") return true;

    if (strategyType.startsWith("pt")) {
      const hasPendleRouter = typeof meta.pendle_router === "string" &&
        meta.pendle_router.trim() !== "";
      const hasMarket = typeof meta.market === "string" &&
        meta.market.trim() !== "";
      const hasPtToken = typeof meta.pt === "string" &&
        meta.pt.trim() !== "";
      if (!hasPendleRouter && !hasMarket && !hasPtToken) return true;
    }

    return false;
  }

  for (const item of Object.values(entry.strategies)) {
    if (!shouldRefreshStrategyMetadata(item)) continue;
    if (!item.address) continue;

    let meta: Record<string, unknown> = {};
    try {
      meta = await getStrategyMetadata(item.address, entry.chain_id);
    } catch {
      meta = {};
    }

    if (Object.keys(meta).length > 0) {
      const merged = { ...(item.meta ?? {}) };
      Object.assign(merged, meta);
      item.meta = merged;
    }
    item.onchain_loaded = true;
  }
}

function applyConfigOverrides(
  entry: VaultEntry,
  defaults: Record<string, unknown>,
  strategyOverrides: Record<string, Record<string, unknown>>,
  hardcodedAprs: Record<string, unknown>,
): void {
  for (const item of Object.values(entry.strategies)) {
    const config = strategyConfig(
      item.address,
      defaults,
      strategyOverrides,
      hardcodedAprs,
    );
    item.apr_source = config.apr_source;
    item.offchain = config.offchain;
    item.points = config.points;
    const meta = { ...(item.meta ?? {}) };
    const overrideMeta = config.meta ?? {};
    if (Object.keys(overrideMeta).length > 0) {
      Object.assign(meta, overrideMeta);
    }
    item.meta = meta;
  }
}

function startBlockForVault(
  chainId: number,
  vault: string,
  cacheConfig: CacheConfig,
): number {
  const vaultOverride = cacheConfig.vaults?.[vault.toLowerCase()];
  if (vaultOverride?.start_block !== undefined) return vaultOverride.start_block;
  const chainOverride = cacheConfig.chains?.[String(chainId)];
  if (chainOverride?.start_block !== undefined) return chainOverride.start_block;
  return cacheConfig.start_block ?? 0;
}

async function sync(
  vault: string,
  chainId: number,
  entries: CacheData,
  cacheConfig: CacheConfig,
): Promise<VaultEntry> {
  const key = vaultKey(vault, chainId);
  let entry = entries[key];
  if (!entry) {
    entry = {
      chain_id: chainId,
      vault,
      strategies: {},
      last_block: 0,
      updated_at: 0,
    };
    entries[key] = entry;
  } else {
    const normalized = normalizeEntry(entry as unknown as Record<string, unknown>);
    entries[key] = normalized;
    entry = normalized;
  }

  const latestBlock = await getLatestBlock(chainId);
  if (latestBlock === 0) return entry;

  const startBlock = startBlockForVault(chainId, vault, cacheConfig);
  const lastBlock = entry.last_block;
  const fromBlock = lastBlock > 0 ? lastBlock + 1 : startBlock;

  if (fromBlock > latestBlock) {
    entry.updated_at = Date.now() / 1000;
    return entry;
  }

  const defaults = (cacheConfig.defaults ?? {}) as Record<string, unknown>;
  const strategyOverrides: Record<string, Record<string, unknown>> = {};
  for (const [addr, cfg] of Object.entries(cacheConfig.strategies ?? {})) {
    strategyOverrides[addr.toLowerCase()] = cfg as Record<string, unknown>;
  }
  const hardcodedAprs: Record<string, unknown> = {};
  for (const [addr, cfg] of Object.entries(cacheConfig.hardcoded_aprs ?? {})) {
    hardcodedAprs[addr.toLowerCase()] = cfg;
  }

  const { events, lastBlock: fetchedLastBlock } = await fetchStrategyChangedEvents(
    chainId,
    vault,
    fromBlock,
  );

  for (const event of events) {
    applyEvent(entry, event, defaults, strategyOverrides, hardcodedAprs);
  }

  entry.last_block = fetchedLastBlock;
  await hydrateOnchainMetadata(entry);
  applyConfigOverrides(entry, defaults, strategyOverrides, hardcodedAprs);
  entry.updated_at = Date.now() / 1000;

  return entry;
}

function discoverCollateralVaults(results: CacheData): VaultRef[] {
  const discovered: Map<string, VaultRef> = new Map();

  for (const entry of Object.values(results)) {
    const chainId = entry.chain_id;
    if (chainId <= 0) continue;

    for (const item of Object.values(entry.strategies ?? {})) {
      const meta = item.meta ?? {};
      const strategyType = String(meta.type ?? "").toLowerCase().replace(/_/g, "-");
      if (!LOOPER_TYPES.has(strategyType)) continue;

      const collateral = meta.collateral as
        | { address?: string; name?: string }
        | undefined;
      if (!collateral?.address) continue;

      const addr = collateral.address.trim();
      if (!addr) continue;

      const key = `${chainId}:${addr.toLowerCase()}`;
      if (!discovered.has(key)) {
        discovered.set(key, {
          address: addr,
          chain_id: chainId,
          symbol: collateral.name ?? "collateral",
        });
      }
    }
  }

  return Array.from(discovered.values());
}

export async function syncAll(
  vaults: VaultRef[],
  cacheConfig: CacheConfig,
): Promise<CacheData> {
  const cached = await readCache();
  const entries: CacheData = {};

  if (cached) {
    for (const [key, value] of Object.entries(cached)) {
      if (typeof value === "object" && value !== null) {
        entries[key] = normalizeEntry(value as Record<string, unknown>);
      }
    }
  }

  for (const vault of vaults) {
    await sync(vault.address, vault.chain_id, entries, cacheConfig);
  }

  const seen = new Set(
    vaults.map((v) => vaultKey(v.address, v.chain_id)),
  );

  const collateralVaults = discoverCollateralVaults(entries).filter(
    (v) => !seen.has(vaultKey(v.address, v.chain_id)),
  );

  for (const vault of collateralVaults) {
    await sync(vault.address, vault.chain_id, entries, cacheConfig);
  }

  await writeCache(entries as unknown as Record<string, unknown>);
  return entries;
}

export async function getStrategyEntries(
  vault: string,
  chainId: number,
  cacheConfig: StrategyCacheConfig,
): Promise<StrategyEntry[]> {
  const cached = await readCache();
  if (!cached) return [];

  const key = vaultKey(vault, chainId);
  const raw = cached[key];
  if (!raw || typeof raw !== "object") return [];

  const entry = normalizeEntry(raw as Record<string, unknown>);

  const defaults = (cacheConfig.defaults ?? {}) as Record<string, unknown>;
  const strategyOverrides: Record<string, Record<string, unknown>> = {};
  for (const [addr, cfg] of Object.entries(cacheConfig.strategies ?? {})) {
    strategyOverrides[addr.toLowerCase()] = cfg as Record<string, unknown>;
  }
  const hardcodedAprs: Record<string, unknown> = {};
  for (const [addr, cfg] of Object.entries(cacheConfig.hardcoded_aprs ?? {})) {
    hardcodedAprs[addr.toLowerCase()] = cfg;
  }

  applyConfigOverrides(entry, defaults, strategyOverrides, hardcodedAprs);

  const strategies = entry.strategies;
  return Object.values(strategies)
    .filter((item) => item.active)
    .map((item) => ({
      address: item.address,
      active: item.active,
      apr_source: item.apr_source,
      offchain: item.offchain,
      meta: item.meta,
      points: item.points,
    }));
}

export function getStrategyConfig(
  address: string,
  cacheConfig: StrategyCacheConfig,
): {
  apr_source: string;
  offchain: Record<string, unknown>;
  meta: Record<string, unknown>;
  points: boolean;
} {
  const defaults = (cacheConfig.defaults ?? {}) as Record<string, unknown>;
  const strategyOverrides: Record<string, Record<string, unknown>> = {};
  for (const [addr, cfg] of Object.entries(cacheConfig.strategies ?? {})) {
    strategyOverrides[addr.toLowerCase()] = cfg as Record<string, unknown>;
  }
  const hardcodedAprs: Record<string, unknown> = {};
  for (const [addr, cfg] of Object.entries(cacheConfig.hardcoded_aprs ?? {})) {
    hardcodedAprs[addr.toLowerCase()] = cfg;
  }

  return strategyConfig(address, defaults, strategyOverrides, hardcodedAprs);
}
