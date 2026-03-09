import {
  createPublicClient,
  http,
  parseAbi,
  type PublicClient,
  type Address,
  getAddress,
} from "viem";
import { mainnet, arbitrum, type Chain } from "viem/chains";
import type { OnchainSourceConfig, ChainSourceConfig } from "./config";

export const ONE = 10n ** 18n;
export const SECONDS_PER_YEAR = 31_536_000;

const chainDefs: Record<number, Chain> = {
  1: mainnet,
  42161: arbitrum,
};

const nameAbi = parseAbi(["function name() view returns (string)"]);

const vaultAbi = parseAbi([
  "function totalAssets() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function strategies(address) view returns (uint256 activation, uint256 last_report, uint256 current_debt, uint256 max_debt)",
  "function profitMaxUnlockTime() view returns (uint256)",
]);

const aprOracleAbi = parseAbi([
  "function getStrategyApr(address _strategy, int256 _delta) view returns (uint256)",
]);

const lockedYvusdAbi = parseAbi([
  "function feeConfig() view returns (uint16 managementFee, uint16 performanceFee, uint16 lockerBonus)",
  "function cooldownDuration() view returns (uint256)",
  "function withdrawWindow() view returns (uint256)",
]);

const morphoOracleAbi = parseAbi([
  "function price() view returns (uint256)",
]);

const erc4626Abi = parseAbi([
  "function totalAssets() view returns (uint256)",
  "function asset() view returns (address)",
  "function convertToAssets(uint256 shares) view returns (uint256)",
]);

const morphoMarketAbi = parseAbi([
  "function idToMarketParams(bytes32 id) view returns (address loanToken, address collateralToken, address oracle, address irm, uint256 lltv)",
  "function market(bytes32 id) view returns (uint128 totalSupplyAssets, uint128 totalSupplyShares, uint128 totalBorrowAssets, uint128 totalBorrowShares, uint128 lastUpdate, uint128 fee)",
]);

const morphoIrmAbi = parseAbi([
  "function borrowRateView((address loanToken, address collateralToken, address oracle, address irm, uint256 lltv) marketParams, (uint128 totalSupplyAssets, uint128 totalSupplyShares, uint128 totalBorrowAssets, uint128 totalBorrowShares, uint128 lastUpdate, uint128 fee) market) view returns (uint256)",
]);

const currentLeverageRatioAbi = parseAbi([
  "function getCurrentLeverageRatio() view returns (uint256)",
]);

const crossChainAbi = parseAbi([
  "function REMOTE_CHAIN_ID() view returns (uint256)",
  "function REMOTE_COUNTERPART() view returns (address)",
  "function vault() view returns (address)",
]);

const targetLeverageAbi = parseAbi([
  "function targetLeverageRatio() view returns (uint256)",
]);
const morphoAbi = parseAbi(["function morpho() view returns (address)"]);
const aTokenAbi = parseAbi(["function aToken() view returns (address)"]);
const pendleRouterAbi = parseAbi([
  "function pendleRouter() view returns (address)",
]);
const routerAbi = parseAbi([
  "function router() view returns (address)",
]);
const pendleRouterConstAbi = parseAbi([
  "function PENDLE_ROUTER() view returns (address)",
]);
const routerConstAbi = parseAbi([
  "function ROUTER() view returns (address)",
]);
const pendleMarketAbi = parseAbi([
  "function market() view returns (address)",
]);
const pendleMarketAltAbi = parseAbi([
  "function pendleMarket() view returns (address)",
]);
const pendleMarketConstAbi = parseAbi([
  "function MARKET() view returns (address)",
]);
const pendlePtAbi = parseAbi([
  "function pt() view returns (address)",
]);
const pendlePtAltAbi = parseAbi([
  "function PT() view returns (address)",
]);
const principalTokenAbi = parseAbi([
  "function principalToken() view returns (address)",
]);
const pendleReadStateAbi = parseAbi([
  "function readState(address router) view returns ((int256 totalPt, int256 totalSy, int256 totalLp, address treasury, int256 scalarRoot, uint256 expiry, uint256 lnFeeRateRoot, uint256 reserveFeePercent, uint256 lastLnImpliedRate) market)",
]);
const marketIdAbi = parseAbi([
  "function marketId() view returns (bytes32)",
]);
const collateralTokenAbi = parseAbi([
  "function collateralToken() view returns (address)",
]);

const PENDLE_API_BASE_URL = "https://api-v2.pendle.finance/core/v1";
const PENDLE_API_CACHE_TTL_MS = 60_000;
const pendleApiCache = new Map<
  string,
  {
    fetchedAt: number;
    entries: Array<{ pt: string; market: string; apy: number | null }>;
  }
>();

const clients: Map<number, PublicClient> = new Map();
let _sourceConfig: OnchainSourceConfig | undefined;

export function initOnchainClients(config: OnchainSourceConfig): void {
  _sourceConfig = config;
}

function resolveRpcUrl(
  chainConfig?: { rpc_url_env?: string; rpc_url?: string },
): string | undefined {
  if (!chainConfig) return undefined;
  if (chainConfig.rpc_url) return chainConfig.rpc_url;
  if (chainConfig.rpc_url_env) return process.env[chainConfig.rpc_url_env] || undefined;
  return undefined;
}

export function getViemClient(chainId: number): PublicClient | null {
  const existing = clients.get(chainId);
  if (existing) return existing;

  const chainCfg = _sourceConfig?.chains?.[String(chainId)];
  const rpcUrl = resolveRpcUrl(chainCfg) ?? resolveRpcUrl(_sourceConfig);
  if (!rpcUrl) return null;

  const chain = chainDefs[chainId];
  const client = createPublicClient({
    chain,
    transport: http(rpcUrl),
  }) as PublicClient;

  clients.set(chainId, client);
  return client;
}

async function probeAddress(
  address: Address,
  chainId: number,
  abi: readonly unknown[],
  functionName: string,
): Promise<Address | null> {
  const client = getViemClient(chainId);
  if (!client) return null;
  try {
    const result = await client.readContract({
      address,
      abi: abi as never,
      functionName: functionName as never,
    });
    return result as Address;
  } catch {
    return null;
  }
}

async function probeUint(
  address: Address,
  chainId: number,
  abi: readonly unknown[],
  functionName: string,
): Promise<bigint | null> {
  const client = getViemClient(chainId);
  if (!client) return null;
  try {
    const result = await client.readContract({
      address,
      abi: abi as never,
      functionName: functionName as never,
    });
    return result as bigint;
  } catch {
    return null;
  }
}

async function probeBytes32(
  address: Address,
  chainId: number,
  abi: readonly unknown[],
  functionName: string,
): Promise<string | null> {
  const client = getViemClient(chainId);
  if (!client) return null;
  try {
    const result = await client.readContract({
      address,
      abi: abi as never,
      functionName: functionName as never,
    });
    return result as string;
  } catch {
    return null;
  }
}

function isValidNonZeroBytes32(value: string | null): value is `0x${string}` {
  if (!value) return false;
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) return false;
  return value !== `0x${"0".repeat(64)}`;
}

async function probePendleMarket(
  address: Address,
  chainId: number,
): Promise<Address | null> {
  const market = await probeAddress(address, chainId, pendleMarketAbi, "market");
  if (market) return market;
  const alt = await probeAddress(address, chainId, pendleMarketAltAbi, "pendleMarket");
  if (alt) return alt;
  return probeAddress(address, chainId, pendleMarketConstAbi, "MARKET");
}

async function probePendlePt(
  address: Address,
  chainId: number,
): Promise<Address | null> {
  const principalToken = await probeAddress(address, chainId, principalTokenAbi, "principalToken");
  if (principalToken) return principalToken;
  const pt = await probeAddress(address, chainId, pendlePtAbi, "pt");
  if (pt) return pt;
  return probeAddress(address, chainId, pendlePtAltAbi, "PT");
}

async function probePendleRouter(
  address: Address,
  chainId: number,
): Promise<Address | null> {
  const pendleRouter = await probeAddress(address, chainId, pendleRouterAbi, "pendleRouter");
  if (pendleRouter) return pendleRouter;
  const router = await probeAddress(address, chainId, routerAbi, "router");
  if (router) return router;
  const pendleRouterConst = await probeAddress(address, chainId, pendleRouterConstAbi, "PENDLE_ROUTER");
  if (pendleRouterConst) return pendleRouterConst;
  return probeAddress(address, chainId, routerConstAbi, "ROUTER");
}

function parseAddressRef(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;
  const candidate = raw.includes("-") ? raw.split("-").pop() ?? "" : raw;
  if (!candidate.startsWith("0x")) return null;
  try {
    return getAddress(candidate);
  } catch {
    return null;
  }
}

export async function getContractName(
  address: string,
  chainId: number,
): Promise<string | null> {
  const client = getViemClient(chainId);
  if (!client) return null;
  try {
    return await client.readContract({
      address: getAddress(address),
      abi: nameAbi,
      functionName: "name",
    });
  } catch {
    return null;
  }
}

export interface ClassificationMeta {
  type: string;
  remote_chain_id?: number;
  remote_counterpart?: string;
  remote_vault?: string;
  remote_vault_name?: string;
  remote_vault_type?: string;
  morpho?: string;
  market_id?: string;
  market?: string;
  pt?: string;
  aToken?: string;
  pendle_router?: string;
  collateral?: { address: string; name: string };
  [key: string]: unknown;
}

export async function classifyAddress(
  address: string,
  chainId: number,
  allowCrossChain: boolean,
): Promise<ClassificationMeta> {
  const addr = getAddress(address);
  const meta: ClassificationMeta = { type: "default" };

  if (allowCrossChain) {
    const remoteChainId = await probeUint(
      addr,
      chainId,
      crossChainAbi,
      "REMOTE_CHAIN_ID",
    );
    if (remoteChainId !== null) {
      meta.type = "cross-chain";
      meta.remote_chain_id = Number(remoteChainId);

      const counterpart = await probeAddress(
        addr,
        chainId,
        crossChainAbi,
        "REMOTE_COUNTERPART",
      );
      if (counterpart) {
        meta.remote_counterpart = counterpart;

        const rcid = Number(remoteChainId);
        if (rcid > 0) {
          const remoteClient = getViemClient(rcid);
          if (remoteClient) {
            try {
              const remoteVault = await remoteClient.readContract({
                address: getAddress(counterpart),
                abi: crossChainAbi,
                functionName: "vault",
              });
              if (remoteVault) {
                const rv = remoteVault as Address;
                meta.remote_vault = rv;
                const remoteVaultName = await getContractName(rv, rcid);
                meta.remote_vault_name = remoteVaultName ?? rv;
                const remoteMeta = await classifyAddress(rv, rcid, false);
                meta.remote_vault_type = remoteMeta.type ?? "default";
              }
            } catch {
              // remote read failed
            }
          }
        }
      }
      return meta;
    }
  }

  const leverageRatio = await probeUint(
    addr,
    chainId,
    targetLeverageAbi,
    "targetLeverageRatio",
  );
  if (leverageRatio !== null) {
    const marketId = await probeBytes32(addr, chainId, marketIdAbi, "marketId");
    const hasMorphoMarketId = isValidNonZeroBytes32(marketId);
    const morphoAddr = await probeAddress(addr, chainId, morphoAbi, "morpho");
    const aTokenAddr = await probeAddress(addr, chainId, aTokenAbi, "aToken");
    let pendleAddr = await probePendleRouter(addr, chainId);
    let market = await probePendleMarket(addr, chainId);
    const pt = await probePendlePt(addr, chainId);
    if (!market && pt) {
      market = await probePendleMarket(pt, chainId);
    }
    if (!pendleAddr && pt) {
      pendleAddr = await probePendleRouter(pt, chainId);
    }

    let baseType = "looper";
    if (hasMorphoMarketId) {
      baseType = "morpho-looper";
      meta.market_id = marketId;
      if (morphoAddr) meta.morpho = morphoAddr;
    } else if (aTokenAddr !== null) {
      baseType = "aave-looper";
      meta.aToken = aTokenAddr;
    }

    // router() exists on many non-Pendle contracts; only classify as Pendle
    // when we can detect PT or market endpoints.
    const hasPendleSignal = market !== null || pt !== null;
    if (hasPendleSignal) {
      if (pendleAddr) meta.pendle_router = pendleAddr;
      if (market) meta.market = market;
      if (pt) meta.pt = pt;
      meta.type = `pt-${baseType}`;
    } else {
      meta.type = baseType;
    }

    const collateralAddr = await probeAddress(
      addr,
      chainId,
      collateralTokenAbi,
      "collateralToken",
    );
    if (collateralAddr) {
      const collateralName = await getContractName(collateralAddr, chainId);
      meta.collateral = {
        address: collateralAddr,
        name: collateralName ?? collateralAddr,
      };
    }
    return meta;
  }

  let pendleAddr = await probePendleRouter(addr, chainId);
  let market = await probePendleMarket(addr, chainId);
  const pt = await probePendlePt(addr, chainId);
  if (!market && pt) {
    market = await probePendleMarket(pt, chainId);
  }
  if (!pendleAddr && pt) {
    pendleAddr = await probePendleRouter(pt, chainId);
  }
  // router() alone is too weak; require PT or market for Pendle classification.
  const hasPendleSignal = market !== null || pt !== null;
  if (hasPendleSignal) {
    meta.type = "pt";
    if (pendleAddr) meta.pendle_router = pendleAddr;
    if (market) meta.market = market;
    if (pt) meta.pt = pt;
  }

  return meta;
}

export async function getStrategyMetadata(
  strategy: string,
  chainId: number,
): Promise<Record<string, unknown>> {
  const meta: Record<string, unknown> = {};
  const name = await getContractName(strategy, chainId);
  meta.name = name ?? strategy;

  const classification = await classifyAddress(strategy, chainId, true);
  Object.assign(meta, classification);
  if (!meta.type) meta.type = "default";
  return meta;
}

export async function getLatestBlock(chainId: number): Promise<number> {
  const client = getViemClient(chainId);
  if (!client) return 0;
  try {
    return Number(await client.getBlockNumber());
  } catch {
    return 0;
  }
}

export function getAprOracleAddress(chainId: number): string | null {
  const chainCfg = _sourceConfig?.chains?.[String(chainId)] as ChainSourceConfig | undefined;
  return chainCfg?.apr_oracle_address ?? _sourceConfig?.apr_oracle_address ?? null;
}

export async function getVaultTotalAssets(vault: string, chainId: number): Promise<bigint> {
  const client = getViemClient(chainId);
  if (!client) return 0n;
  try {
    return await client.readContract({
      address: getAddress(vault),
      abi: vaultAbi,
      functionName: "totalAssets",
    });
  } catch {
    return 0n;
  }
}

export async function getVaultTotalSupply(vault: string, chainId: number): Promise<bigint> {
  const client = getViemClient(chainId);
  if (!client) return 0n;
  try {
    return await client.readContract({
      address: getAddress(vault),
      abi: vaultAbi,
      functionName: "totalSupply",
    });
  } catch {
    return 0n;
  }
}

export async function getVaultProfitMaxUnlockTime(vault: string, chainId: number): Promise<bigint> {
  const client = getViemClient(chainId);
  if (!client) return 0n;
  try {
    return await client.readContract({
      address: getAddress(vault),
      abi: vaultAbi,
      functionName: "profitMaxUnlockTime",
    });
  } catch {
    return 0n;
  }
}

export async function getVaultStrategyParams(
  vault: string,
  chainId: number,
  strategy: string,
): Promise<{ activation: bigint; lastReport: bigint; currentDebt: bigint; maxDebt: bigint } | null> {
  const client = getViemClient(chainId);
  if (!client) return null;
  try {
    const result = await client.readContract({
      address: getAddress(vault),
      abi: vaultAbi,
      functionName: "strategies",
      args: [getAddress(strategy)],
    });
    return {
      activation: result[0],
      lastReport: result[1],
      currentDebt: result[2],
      maxDebt: result[3],
    };
  } catch {
    return null;
  }
}

export async function getStrategyApr(
  strategy: string,
  debtChange: bigint,
  chainId: number,
): Promise<bigint | null> {
  const oracleAddr = getAprOracleAddress(chainId);
  if (!oracleAddr) return null;
  const client = getViemClient(chainId);
  if (!client) return null;
  try {
    return await client.readContract({
      address: getAddress(oracleAddr),
      abi: aprOracleAbi,
      functionName: "getStrategyApr",
      args: [getAddress(strategy), debtChange],
    });
  } catch {
    return null;
  }
}

export async function getLockedFeeConfig(
  lockedVault: string,
  chainId: number,
): Promise<{
  managementFee: number;
  performanceFee: number;
  lockerBonus: number;
  cooldownDuration: number;
  withdrawWindow: number;
} | null> {
  const client = getViemClient(chainId);
  if (!client) return null;
  try {
    const feeResult = await client.readContract({
      address: getAddress(lockedVault),
      abi: lockedYvusdAbi,
      functionName: "feeConfig",
    });
    const cooldownResult = await client.readContract({
      address: getAddress(lockedVault),
      abi: lockedYvusdAbi,
      functionName: "cooldownDuration",
    });
    const withdrawWindowResult = await client.readContract({
      address: getAddress(lockedVault),
      abi: lockedYvusdAbi,
      functionName: "withdrawWindow",
    });
    return {
      managementFee: Number(feeResult[0]),
      performanceFee: Number(feeResult[1]),
      lockerBonus: Number(feeResult[2]),
      cooldownDuration: Number(cooldownResult),
      withdrawWindow: Number(withdrawWindowResult),
    };
  } catch {
    return null;
  }
}

export async function getErc4626TotalAssets(vault: string, chainId: number): Promise<bigint> {
  const client = getViemClient(chainId);
  if (!client) return 0n;
  try {
    return await client.readContract({
      address: getAddress(vault),
      abi: erc4626Abi,
      functionName: "totalAssets",
    });
  } catch {
    return 0n;
  }
}

export async function getErc4626Asset(vault: string, chainId: number): Promise<string | null> {
  const client = getViemClient(chainId);
  if (!client) return null;
  try {
    return await client.readContract({
      address: getAddress(vault),
      abi: erc4626Abi,
      functionName: "asset",
    });
  } catch {
    return null;
  }
}

export async function getErc4626ConvertToAssets(
  vault: string,
  chainId: number,
  shares: bigint,
  blockNumber?: bigint,
): Promise<bigint | null> {
  const client = getViemClient(chainId);
  if (!client) return null;
  try {
    return await client.readContract({
      address: getAddress(vault),
      abi: erc4626Abi,
      functionName: "convertToAssets",
      args: [shares],
      ...(blockNumber !== undefined ? { blockNumber } : {}),
    });
  } catch {
    return null;
  }
}

export async function getStrategyMarketId(strategy: string, chainId: number): Promise<string | null> {
  return probeBytes32(getAddress(strategy), chainId, marketIdAbi, "marketId");
}

export async function getStrategyMorpho(strategy: string, chainId: number): Promise<string | null> {
  return probeAddress(getAddress(strategy), chainId, morphoAbi, "morpho");
}

export async function getStrategyLeverageRatio(strategy: string, chainId: number): Promise<bigint | null> {
  const current = await probeUint(
    getAddress(strategy),
    chainId,
    currentLeverageRatioAbi,
    "getCurrentLeverageRatio",
  );
  if (current !== null) return current;
  return probeUint(getAddress(strategy), chainId, targetLeverageAbi, "targetLeverageRatio");
}

export async function getStrategyPendleMarket(
  strategy: string,
  chainId: number,
): Promise<string | null> {
  const market = await probePendleMarket(getAddress(strategy), chainId);
  return market ?? null;
}

export async function getStrategyPendleRouter(
  strategy: string,
  chainId: number,
): Promise<string | null> {
  const router = await probePendleRouter(getAddress(strategy), chainId);
  return router ?? null;
}

export async function getPendleMarketApyFromApi(
  chainId: number,
  ptAddress: string,
): Promise<{ market: string | null; apyRaw: bigint | null }> {
  if (!Number.isFinite(chainId) || chainId <= 0) {
    return { market: null, apyRaw: null };
  }

  let normalizedPt: string;
  try {
    normalizedPt = getAddress(ptAddress).toLowerCase();
  } catch {
    return { market: null, apyRaw: null };
  }

  const cacheKey = String(chainId);
  const now = Date.now();
  let cached = pendleApiCache.get(cacheKey);

  if (!cached || now - cached.fetchedAt > PENDLE_API_CACHE_TTL_MS) {
    try {
      const url = `${PENDLE_API_BASE_URL}/${chainId}/markets/active`;
      const response = await fetch(url, { method: "GET", headers: { accept: "application/json" } });
      if (!response.ok) {
        return { market: null, apyRaw: null };
      }

      const payload = await response.json() as { markets?: unknown[] };
      const markets = Array.isArray(payload?.markets) ? payload.markets : [];
      const entries: Array<{ pt: string; market: string; apy: number | null }> = [];

      for (const item of markets) {
        if (typeof item !== "object" || item === null) continue;
        const record = item as Record<string, unknown>;

        const market = parseAddressRef(record.address);
        const pt = parseAddressRef(record.pt);
        if (!market || !pt) continue;

        let apy: number | null = null;
        const details = record.details;
        if (typeof details === "object" && details !== null) {
          const detailsRec = details as Record<string, unknown>;
          const pendleApy = detailsRec.pendleApy;
          if (typeof pendleApy === "number" && Number.isFinite(pendleApy)) {
            apy = pendleApy;
          }
        } else {
          const pendleApy = record.pendleApy;
          if (typeof pendleApy === "number" && Number.isFinite(pendleApy)) {
            apy = pendleApy;
          }
        }

        entries.push({ pt: pt.toLowerCase(), market, apy });
      }

      cached = { fetchedAt: now, entries };
      pendleApiCache.set(cacheKey, cached);
    } catch {
      return { market: null, apyRaw: null };
    }
  }

  const match = cached.entries.find((entry) => entry.pt === normalizedPt);
  if (!match) return { market: null, apyRaw: null };

  let apyRaw: bigint | null = null;
  if (match.apy !== null) {
    try {
      apyRaw = BigInt(Math.round(match.apy * Number(ONE)));
    } catch {
      apyRaw = null;
    }
  }

  return { market: match.market, apyRaw };
}

export function lnImpliedRateToApyRaw(lnImpliedRate: bigint): bigint {
  if (lnImpliedRate <= 0n) return 0n;
  try {
    const ln = Number(lnImpliedRate) / Number(ONE);
    const apy = Math.expm1(ln);
    if (!Number.isFinite(apy)) {
      return lnImpliedRate > 0n ? lnImpliedRate : 0n;
    }
    const result = BigInt(Math.round(apy * Number(ONE)));
    return result > 0n ? result : 0n;
  } catch {
    return lnImpliedRate > 0n ? lnImpliedRate : 0n;
  }
}

export async function getPendleMarketImpliedApy(
  market: string,
  router: string,
  chainId: number,
): Promise<bigint | null> {
  const client = getViemClient(chainId);
  if (!client) return null;

  try {
    const result = await client.readContract({
      address: getAddress(market),
      abi: pendleReadStateAbi,
      functionName: "readState",
      args: [getAddress(router)],
    }) as unknown;

    let lnImpliedRate: bigint | null = null;
    if (Array.isArray(result) && typeof result[8] === "bigint") {
      lnImpliedRate = result[8];
    } else if (typeof result === "object" && result !== null) {
      const state = result as Record<string, unknown>;
      const direct = state.lastLnImpliedRate;
      if (typeof direct === "bigint") {
        lnImpliedRate = direct;
      } else {
        const nested = state.market;
        if (typeof nested === "object" && nested !== null) {
          const nestedState = nested as Record<string, unknown>;
          const nestedRate = nestedState.lastLnImpliedRate;
          if (typeof nestedRate === "bigint") {
            lnImpliedRate = nestedRate;
          }
        }
      }
    }

    if (lnImpliedRate === null) return null;
    return lnImpliedRateToApyRaw(lnImpliedRate);
  } catch {
    return null;
  }
}

export async function getMorphoMarketBorrowApy(
  morpho: string,
  marketId: string,
  chainId: number,
): Promise<bigint | null> {
  const client = getViemClient(chainId);
  if (!client) return null;

  try {
    const marketParams = await client.readContract({
      address: getAddress(morpho),
      abi: morphoMarketAbi,
      functionName: "idToMarketParams",
      args: [marketId as `0x${string}`],
    });
    const market = await client.readContract({
      address: getAddress(morpho),
      abi: morphoMarketAbi,
      functionName: "market",
      args: [marketId as `0x${string}`],
    });

    const irm = marketParams[3];
    if (!irm) return null;

    const borrowRatePerSecond = await client.readContract({
      address: getAddress(irm),
      abi: morphoIrmAbi,
      functionName: "borrowRateView",
      args: [
        {
          loanToken: marketParams[0],
          collateralToken: marketParams[1],
          oracle: marketParams[2],
          irm: marketParams[3],
          lltv: marketParams[4],
        },
        {
          totalSupplyAssets: market[0],
          totalSupplyShares: market[1],
          totalBorrowAssets: market[2],
          totalBorrowShares: market[3],
          lastUpdate: market[4],
          fee: market[5],
        },
      ],
    });

    return ratePerSecondToApyRaw(borrowRatePerSecond);
  } catch {
    return null;
  }
}

export function ratePerSecondToApyRaw(ratePerSecond: bigint): bigint {
  if (ratePerSecond <= 0n) return 0n;

  const linearAprRaw = ratePerSecond * BigInt(SECONDS_PER_YEAR);
  try {
    const rps = Number(ratePerSecond) / Number(ONE);
    const apy = Math.expm1(Math.log1p(rps) * SECONDS_PER_YEAR);
    if (!Number.isFinite(apy)) return linearAprRaw > 0n ? linearAprRaw : 0n;
    const result = BigInt(Math.round(apy * Number(ONE)));
    return result > 0n ? result : 0n;
  } catch {
    return linearAprRaw > 0n ? linearAprRaw : 0n;
  }
}

async function getBlock(
  chainId: number,
  blockNumber: bigint,
): Promise<{ number: bigint; timestamp: bigint } | null> {
  const client = getViemClient(chainId);
  if (!client) return null;
  try {
    const block = await client.getBlock({ blockNumber });
    return { number: block.number, timestamp: block.timestamp };
  } catch {
    return null;
  }
}

async function findBlockAtOrBeforeTimestamp(
  chainId: number,
  targetTs: bigint,
  latestBlock: bigint,
): Promise<bigint | null> {
  let lo = 0n;
  let hi = latestBlock;
  let best: bigint | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) / 2n;
    const block = await getBlock(chainId, mid);
    if (!block) return best;
    if (block.timestamp <= targetTs) {
      best = mid;
      lo = mid + 1n;
    } else {
      hi = mid - 1n;
    }
  }
  return best;
}

async function historicalConvertToAssetsAprForWindow(
  vault: string,
  chainId: number,
  windowSeconds: number,
  sharesRaw: bigint,
): Promise<bigint | null> {
  if (windowSeconds <= 0 || sharesRaw <= 0n) return null;

  const client = getViemClient(chainId);
  if (!client) return null;

  let latestBlockNum: bigint;
  try {
    latestBlockNum = await client.getBlockNumber();
  } catch {
    return null;
  }
  if (latestBlockNum <= 0n) return null;

  const latestBlockData = await getBlock(chainId, latestBlockNum);
  if (!latestBlockData) return null;
  const latestTs = latestBlockData.timestamp;
  if (latestTs <= 0n) return null;

  const targetTs = latestTs - BigInt(windowSeconds);
  if (targetTs <= 0n) return null;

  const oldBlockNum = await findBlockAtOrBeforeTimestamp(chainId, targetTs, latestBlockNum);
  if (oldBlockNum === null) return null;

  const oldBlockData = await getBlock(chainId, oldBlockNum);
  if (!oldBlockData) return null;
  const elapsed = Number(latestTs - oldBlockData.timestamp);
  if (elapsed <= 0) return null;

  const latestAssets = await getErc4626ConvertToAssets(vault, chainId, sharesRaw, latestBlockNum);
  const oldAssets = await getErc4626ConvertToAssets(vault, chainId, sharesRaw, oldBlockNum);
  if (latestAssets === null || oldAssets === null || oldAssets <= 0n) return null;

  try {
    const growthRatio = Number(latestAssets) / Number(oldAssets);
    if (growthRatio <= 0) return null;
    const apy = Math.pow(growthRatio, SECONDS_PER_YEAR / elapsed) - 1.0;
    return BigInt(Math.round(apy * Number(ONE)));
  } catch {
    return null;
  }
}

export async function getHistoricalConvertToAssetsApr(
  vault: string,
  chainId: number,
  windowSeconds: number,
  sharesRaw: bigint,
): Promise<bigint | null> {
  if (windowSeconds <= 0 || sharesRaw <= 0n) return null;

  const fallbackWindows = [
    windowSeconds,
    Math.min(windowSeconds, 86_400),
    Math.min(windowSeconds, 21_600),
    Math.min(windowSeconds, 3_600),
    Math.min(windowSeconds, 900),
  ];
  const deduped: number[] = [];
  for (const w of fallbackWindows) {
    if (w > 0 && !deduped.includes(w)) deduped.push(w);
  }

  for (const w of deduped) {
    const apr = await historicalConvertToAssetsAprForWindow(vault, chainId, w, sharesRaw);
    if (apr !== null) return apr;
  }
  return null;
}

export async function getOracleGrowthApr(
  oracleAddress: string,
  chainId: number,
  windowSeconds: number = 7 * 24 * 60 * 60,
): Promise<bigint | null> {
  const client = getViemClient(chainId);
  if (!client) return null;

  try {
    const latestBlockNum = await client.getBlockNumber();
    const latestBlockData = await getBlock(chainId, latestBlockNum);
    if (!latestBlockData) return null;

    const currentPrice = await client.readContract({
      address: getAddress(oracleAddress),
      abi: morphoOracleAbi,
      functionName: "price",
    });
    if (!currentPrice || currentPrice <= 0n) return null;

    const targetTs = latestBlockData.timestamp - BigInt(windowSeconds);
    if (targetTs <= 0n) return null;

    const oldBlockNum = await findBlockAtOrBeforeTimestamp(chainId, targetTs, latestBlockNum);
    if (oldBlockNum === null) return null;

    const oldBlockData = await getBlock(chainId, oldBlockNum);
    if (!oldBlockData) return null;

    const oldPrice = await client.readContract({
      address: getAddress(oracleAddress),
      abi: morphoOracleAbi,
      functionName: "price",
      blockNumber: oldBlockNum,
    });
    if (!oldPrice || oldPrice <= 0n) return null;

    const elapsed = Number(latestBlockData.timestamp - oldBlockData.timestamp);
    if (elapsed <= 0) return null;

    // Linear APR = ((currentPrice - oldPrice) / oldPrice) * (secondsPerYear / elapsed)
    const priceDelta = Number(currentPrice) - Number(oldPrice);
    const growthRate = priceDelta / Number(oldPrice);
    const apr = growthRate * (SECONDS_PER_YEAR / elapsed);
    if (!Number.isFinite(apr)) return null;

    return BigInt(Math.round(apr * Number(ONE)));
  } catch {
    return null;
  }
}

export interface FetchVaultAprDataResult {
  totalAssets: bigint;
  totalSupply: bigint;
  feeConfig: {
    managementFee: number;
    performanceFee: number;
    lockerBonus: number;
    cooldownDuration: number;
    withdrawWindow: number;
  } | null;
  strategyDebts: Map<string, bigint>;
  strategyAprs: Map<string, bigint | null>;
}

export async function fetchVaultAprData(
  vault: string,
  strategies: string[],
  lockedVault: string | null,
  chainId: number,
): Promise<FetchVaultAprDataResult> {
  const client = getViemClient(chainId);
  const emptyResult: FetchVaultAprDataResult = {
    totalAssets: 0n,
    totalSupply: 0n,
    feeConfig: null,
    strategyDebts: new Map(),
    strategyAprs: new Map(),
  };
  if (!client) return emptyResult;

  const oracleAddr = getAprOracleAddress(chainId);
  const vaultAddr = getAddress(vault);

  // Build multicall contracts array
  const contracts: {
    address: Address;
    abi: readonly unknown[];
    functionName: string;
    args?: readonly unknown[];
  }[] = [];

  // index 0: totalAssets
  contracts.push({ address: vaultAddr, abi: vaultAbi as readonly unknown[], functionName: "totalAssets" });
  // index 1: totalSupply
  contracts.push({ address: vaultAddr, abi: vaultAbi as readonly unknown[], functionName: "totalSupply" });

  // indices 2..2+N-1: vault.strategies(addr) for each strategy
  for (const s of strategies) {
    contracts.push({
      address: vaultAddr,
      abi: vaultAbi as readonly unknown[],
      functionName: "strategies",
      args: [getAddress(s)],
    });
  }

  // indices 2+N..2+2N-1: aprOracle.getStrategyApr(addr, 0) for each strategy
  const hasOracle = !!oracleAddr;
  if (hasOracle) {
    for (const s of strategies) {
      contracts.push({
        address: getAddress(oracleAddr!),
        abi: aprOracleAbi as readonly unknown[],
        functionName: "getStrategyApr",
        args: [getAddress(s), 0n],
      });
    }
  }

  // last: locked vault settings if lockedVault provided
  const hasFeeConfig = !!lockedVault;
  let feeConfigIdx = -1;
  let cooldownIdx = -1;
  let withdrawWindowIdx = -1;
  if (hasFeeConfig) {
    feeConfigIdx = contracts.length;
    contracts.push({
      address: getAddress(lockedVault!),
      abi: lockedYvusdAbi as readonly unknown[],
      functionName: "feeConfig",
    });
    cooldownIdx = contracts.length;
    contracts.push({
      address: getAddress(lockedVault!),
      abi: lockedYvusdAbi as readonly unknown[],
      functionName: "cooldownDuration",
    });
    withdrawWindowIdx = contracts.length;
    contracts.push({
      address: getAddress(lockedVault!),
      abi: lockedYvusdAbi as readonly unknown[],
      functionName: "withdrawWindow",
    });
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results: { status: "success" | "failure"; result?: any }[] = await (client as any).multicall({
      contracts,
      allowFailure: true,
    });

    const totalAssets = results[0].status === "success" ? BigInt(results[0].result) : 0n;
    const totalSupply = results[1].status === "success" ? BigInt(results[1].result) : 0n;

    const strategyDebts = new Map<string, bigint>();
    const strategyAprs = new Map<string, bigint | null>();

    for (let i = 0; i < strategies.length; i++) {
      const idx = 2 + i;
      const key = strategies[i].toLowerCase();
      if (results[idx].status === "success") {
        const r = results[idx].result as readonly [bigint, bigint, bigint, bigint];
        strategyDebts.set(key, r[2]);
      } else {
        strategyDebts.set(key, 0n);
      }
    }

    if (hasOracle) {
      for (let i = 0; i < strategies.length; i++) {
        const idx = 2 + strategies.length + i;
        const key = strategies[i].toLowerCase();
        if (results[idx].status === "success") {
          strategyAprs.set(key, BigInt(results[idx].result));
        } else {
          strategyAprs.set(key, null);
        }
      }
    }

    let feeConfig: FetchVaultAprDataResult["feeConfig"] = null;
    if (hasFeeConfig && feeConfigIdx >= 0) {
      if (results[feeConfigIdx].status === "success") {
        const r = results[feeConfigIdx].result as readonly [number, number, number];
        feeConfig = {
          managementFee: Number(r[0]),
          performanceFee: Number(r[1]),
          lockerBonus: Number(r[2]),
          cooldownDuration: cooldownIdx >= 0 && results[cooldownIdx].status === "success"
            ? Number(results[cooldownIdx].result)
            : 0,
          withdrawWindow: withdrawWindowIdx >= 0 && results[withdrawWindowIdx].status === "success"
            ? Number(results[withdrawWindowIdx].result)
            : 0,
        };
      }
    }

    return { totalAssets, totalSupply, feeConfig, strategyDebts, strategyAprs };
  } catch {
    return emptyResult;
  }
}
