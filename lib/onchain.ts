import {
  createPublicClient,
  http,
  parseAbi,
  type PublicClient,
  type Address,
  getAddress,
} from "viem";
import { mainnet, arbitrum, base, type Chain } from "viem/chains";
import {
  DEFAULT_HISTORICAL_WINDOW_SECONDS,
  type OnchainSourceConfig,
  type ChainSourceConfig,
} from "./config";

export const ONE = 10n ** 18n;
export const RAY = 10n ** 27n;
export const SECONDS_PER_YEAR = 31_536_000;

const chainDefs: Record<number, Chain> = {
  1: mainnet,
  42161: arbitrum,
  8453: base,
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
  "function withdrawalWindow() view returns (uint256)",
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
const lendingPoolAbi = parseAbi([
  "function POOL() view returns (address)",
  "function pool() view returns (address)",
]);
const pawnBrokerLooperAbi = parseAbi([
  "function PAWN_BROKER() view returns (address)",
]);
const pawnBrokerRateAbi = parseAbi([
  "function rate() view returns (uint256)",
]);
const morphoAbi = parseAbi(["function morpho() view returns (address)"]);
const aTokenAbi = parseAbi(["function aToken() view returns (address)"]);
const aaveReceiptTokenAbi = parseAbi([
  "function POOL() view returns (address)",
  "function UNDERLYING_ASSET_ADDRESS() view returns (address)",
]);
const aavePoolAbi = parseAbi([
  "function getReserveNormalizedIncome(address asset) view returns (uint256)",
  "function getReserveNormalizedVariableDebt(address asset) view returns (uint256)",
  "function getReserveData(address asset) view returns ((uint256), uint128, uint128, uint128, uint128, uint128, uint40, uint16, address, address, address, address, uint128, uint128, uint128)",
]);
const pendleRouterAbi = parseAbi([
  "function pendleRouter() view returns (address)",
]);
const pendleRouterStaticAbi = parseAbi([
  "function getPtToAssetRate(address market) view returns (uint256)",
  "function swapExactTokenForPtStatic(address market, address tokenIn, uint256 amountTokenIn) view returns (uint256 netPtOut, uint256 netSyFee, uint256 priceImpact, uint256 exchangeRateAfter, uint256 netSyInterm)",
  "function swapExactPtForTokenStatic(address market, uint256 exactPtIn, address tokenOut) view returns (uint256 netTokenOut, uint256 netSyFee, uint256 priceImpact, uint256 exchangeRateAfter, uint256 netSyInterm)",
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
const strategyVaultAbi = parseAbi([
  "function vault() view returns (address)",
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
const pendleStrategyAprAbi = parseAbi([
  "function ORACLE() view returns (address)",
  "function PENDLE_TOKEN() view returns (address)",
  "function markets(address) view returns (address)",
]);
const pendleOracleAbi = parseAbi([
  "function getPtToAssetRate(address market, uint32 duration) view returns (uint256)",
]);
const pendleMarketExpiryAbi = parseAbi([
  "function expiry() view returns (uint256)",
  "function isExpired() view returns (bool)",
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
const MORPHO_API_URL = "https://blue-api.morpho.org/graphql";
const MORPHO_API_CACHE_TTL_MS = 60_000;
const KATANA_SNAPSHOT_API_BASE_URL = "https://kong.yearn.fi/api/rest/snapshot";
const KATANA_APR_CACHE_TTL_MS = 60_000;
const CHAIN_PENDLE_ROUTER_STATIC_ADDRESSES: Record<number, string> = {
  1: "0x263833d47eA3fA4a30f269323aba6a107f9eB14C",
  42161: "0xAdB09F65bd90d19e3148D9ccb693F3161C6DB3E8",
};
const AAVE_POOL_ADDRESSES: Record<number, string> = {
  1: "0x87870Bca3F3fD6335C3F4ce8392D69350B4fa4E2",
};
const pendleApiCache = new Map<
  string,
  {
    fetchedAt: number;
    entries: Array<{ pt: string; market: string; apy: number | null }>;
  }
>();
const morphoApiCache = new Map<
  string,
  { fetchedAt: number; apr: number | null }
>();
const katanaApiCache = new Map<
  string,
  {
    fetchedAt: number;
    payload: KatanaVaultSnapshot;
  }
>();

const clients: Map<number, PublicClient> = new Map();
let _sourceConfig: OnchainSourceConfig | undefined;

interface MorphoVaultApiReward {
  supplyApr?: number | null;
}

interface MorphoVaultApiItem {
  address?: string;
  name?: string;
  symbol?: string;
  asset?: { symbol?: string | null } | null;
  state?: {
    avgNetApy?: number | null;
    avgNetApyExcludingRewards?: number | null;
    netApy?: number | null;
    netApyExcludingRewards?: number | null;
    allRewards?: MorphoVaultApiReward[] | null;
  } | null;
}

interface MorphoVaultV2ApiItem {
  address?: string;
  name?: string;
  symbol?: string;
  asset?: { symbol?: string | null } | null;
  avgNetApy?: number | null;
  avgNetApyExcludingRewards?: number | null;
  netApy?: number | null;
  netApyExcludingRewards?: number | null;
  rewards?: MorphoVaultApiReward[] | null;
}

interface KatanaEstimatedComponents {
  katanaAppRewardsAPR?: number | null;
  fixedRateKatanaRewards?: number | null;
}

export interface KatanaVaultSnapshot {
  performance?: {
    oracle?: {
      apr?: number | null;
      apy?: number | null;
      netAPR?: number | null;
      netAPY?: number | null;
    } | null;
    estimated?: {
      apr?: number | null;
      apy?: number | null;
      components?: KatanaEstimatedComponents | null;
    } | null;
    historical?: {
      net?: number | null;
    } | null;
  } | null;
}

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

function annualizeGrowthRatio(growthRatio: number, elapsedSeconds: number): bigint | null {
  if (!Number.isFinite(growthRatio) || growthRatio <= 0 || elapsedSeconds <= 0) return null;
  try {
    const apy = Math.pow(growthRatio, SECONDS_PER_YEAR / elapsedSeconds) - 1.0;
    if (!Number.isFinite(apy)) return null;
    return BigInt(Math.round(apy * Number(ONE)));
  } catch {
    return null;
  }
}

function annualizeRawGrowth(
  currentValue: bigint,
  oldValue: bigint,
  elapsedSeconds: number,
): bigint | null {
  if (currentValue <= 0n || oldValue <= 0n) return null;
  try {
    return annualizeGrowthRatio(
      Number(currentValue) / Number(oldValue),
      elapsedSeconds,
    );
  } catch {
    return null;
  }
}

function rayAnnualRateToApyRaw(rateRay: bigint): bigint {
  if (rateRay <= 0n) return 0n;

  const linearAprRaw = rateRay / (RAY / ONE);
  try {
    const apr = Number(rateRay) / Number(RAY);
    const apy = Math.expm1(Math.log1p(apr / SECONDS_PER_YEAR) * SECONDS_PER_YEAR);
    if (!Number.isFinite(apy)) return linearAprRaw > 0n ? linearAprRaw : 0n;
    const result = BigInt(Math.round(apy * Number(ONE)));
    return result > 0n ? result : 0n;
  } catch {
    return linearAprRaw > 0n ? linearAprRaw : 0n;
  }
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

function parseFiniteNumber(value: unknown): number | null {
  if (typeof value !== "number") return null;
  return Number.isFinite(value) ? value : null;
}

function aprFloatToRaw(apr: number): bigint | null {
  if (!Number.isFinite(apr)) return null;
  try {
    return BigInt(Math.round(apr * Number(ONE)));
  } catch {
    return null;
  }
}

function getAavePoolAddress(chainId: number): string | null {
  const address = AAVE_POOL_ADDRESSES[chainId];
  if (!address) return null;
  try {
    return getAddress(address);
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
  pool?: string;
  borrow_asset?: string;
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
                meta.remote_meta = remoteMeta;
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

  let leverageRatio = await probeUint(
    addr,
    chainId,
    currentLeverageRatioAbi,
    "getCurrentLeverageRatio",
  );
  if (leverageRatio === null) {
    leverageRatio = await probeUint(
      addr,
      chainId,
      targetLeverageAbi,
      "targetLeverageRatio",
    );
  }
  if (leverageRatio !== null) {
    const marketId = await probeBytes32(addr, chainId, marketIdAbi, "marketId");
    const hasMorphoMarketId = isValidNonZeroBytes32(marketId);
    const morphoAddr = await probeAddress(addr, chainId, morphoAbi, "morpho");
    const aTokenAddr = await probeAddress(addr, chainId, aTokenAbi, "aToken");
    const poolAddr = await probeAddress(addr, chainId, lendingPoolAbi, "POOL") ??
      await probeAddress(addr, chainId, lendingPoolAbi, "pool");
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
    } else if (aTokenAddr !== null || poolAddr !== null) {
      baseType = "aave-looper";
      if (aTokenAddr) meta.aToken = aTokenAddr;
      if (poolAddr) meta.pool = poolAddr;
      const borrowAsset = await probeAddress(addr, chainId, erc4626Abi, "asset");
      if (borrowAsset) meta.borrow_asset = borrowAsset;
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
      functionName: "withdrawalWindow",
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
  return probeUint(
    getAddress(strategy),
    chainId,
    currentLeverageRatioAbi,
    "getCurrentLeverageRatio",
  );
}

export async function getStrategyLendingPool(strategy: string, chainId: number): Promise<string | null> {
  const addr = getAddress(strategy);
  const pool = await probeAddress(addr, chainId, lendingPoolAbi, "POOL");
  if (pool) return pool;
  return probeAddress(addr, chainId, lendingPoolAbi, "pool");
}

export async function getPawnBrokerBorrowApy(
  strategy: string,
  chainId: number,
  pawnBrokerAddress?: string | null,
): Promise<bigint | null> {
  let pawnBroker = normalizeAddressOrNull(pawnBrokerAddress);
  if (!pawnBroker) {
    pawnBroker = await probeAddress(getAddress(strategy), chainId, pawnBrokerLooperAbi, "PAWN_BROKER");
  }
  if (!pawnBroker) return null;

  const rateBps = await probeUint(getAddress(pawnBroker), chainId, pawnBrokerRateAbi, "rate");
  if (rateBps === null) return null;

  return (rateBps * ONE) / 10_000n;
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

function normalizeAddressOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return getAddress(trimmed);
  } catch {
    return null;
  }
}

async function getStrategyPendlePrincipalToken(
  strategy: string,
  chainId: number,
): Promise<string | null> {
  return probeAddress(getAddress(strategy), chainId, principalTokenAbi, "principalToken");
}

async function getStrategyPendleOracle(
  strategy: string,
  chainId: number,
): Promise<string | null> {
  return probeAddress(getAddress(strategy), chainId, pendleStrategyAprAbi, "ORACLE");
}

async function getStrategyPendleToken(
  strategy: string,
  chainId: number,
): Promise<string | null> {
  return probeAddress(getAddress(strategy), chainId, pendleStrategyAprAbi, "PENDLE_TOKEN");
}

async function getStrategyPendleMarketForPt(
  strategy: string,
  pt: string,
  chainId: number,
): Promise<string | null> {
  const client = getViemClient(chainId);
  if (!client) return null;
  try {
    return await client.readContract({
      address: getAddress(strategy),
      abi: pendleStrategyAprAbi,
      functionName: "markets",
      args: [getAddress(pt)],
    });
  } catch {
    return null;
  }
}

export async function getStrategyVault(
  strategy: string,
  chainId: number,
): Promise<string | null> {
  return probeAddress(getAddress(strategy), chainId, strategyVaultAbi, "vault");
}

async function getPendleRouterStatic(chainId: number): Promise<string | null> {
  const address = CHAIN_PENDLE_ROUTER_STATIC_ADDRESSES[chainId];
  if (!address) return null;
  try {
    return getAddress(address);
  } catch {
    return null;
  }
}

async function getAaveReserveContext(
  aToken: string,
  chainId: number,
): Promise<{ pool: string; asset: string } | null> {
  const client = getViemClient(chainId);
  if (!client) return null;

  try {
    const [pool, asset] = await Promise.all([
      client.readContract({
        address: getAddress(aToken),
        abi: aaveReceiptTokenAbi,
        functionName: "POOL",
      }),
      client.readContract({
        address: getAddress(aToken),
        abi: aaveReceiptTokenAbi,
        functionName: "UNDERLYING_ASSET_ADDRESS",
      }),
    ]);
    return { pool: getAddress(pool), asset: getAddress(asset) };
  } catch {
    return null;
  }
}

async function getAaveAssetContext(
  asset: string,
  chainId: number,
): Promise<{ pool: string; asset: string } | null> {
  const pool = getAavePoolAddress(chainId);
  if (!pool) return null;

  try {
    return { pool, asset: getAddress(asset) };
  } catch {
    return null;
  }
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

function morphoVaultItemTotalApr(item: MorphoVaultApiItem | null | undefined): number | null {
  if (!item?.state) return null;

  const avgNetApy = parseFiniteNumber(item.state.avgNetApy) ?? 0;
  if (Number.isFinite(avgNetApy) && avgNetApy !== 0) return avgNetApy;
  const netApy = parseFiniteNumber(item.state.netApy) ?? 0;
  if (Number.isFinite(netApy) && netApy !== 0) return netApy;
  const baseApy = parseFiniteNumber(item.state.avgNetApyExcludingRewards) ??
    parseFiniteNumber(item.state.netApyExcludingRewards) ??
    netApy;
  const rewards = Array.isArray(item.state.allRewards) ? item.state.allRewards : [];
  const rewardsApr = rewards.reduce(
    (sum, reward) => sum + (parseFiniteNumber(reward?.supplyApr) ?? 0),
    0,
  );
  const total = baseApy + rewardsApr;
  return Number.isFinite(total) ? total : null;
}

function morphoVaultV2ItemTotalApr(item: MorphoVaultV2ApiItem | null | undefined): number | null {
  if (!item) return null;

  const avgNetApy = parseFiniteNumber(item.avgNetApy) ?? 0;
  if (Number.isFinite(avgNetApy) && avgNetApy !== 0) return avgNetApy;
  const netApy = parseFiniteNumber(item.netApy) ?? 0;
  if (Number.isFinite(netApy) && netApy !== 0) return netApy;
  const baseApy = parseFiniteNumber(item.avgNetApyExcludingRewards) ??
    parseFiniteNumber(item.netApyExcludingRewards) ??
    netApy;
  const rewards = Array.isArray(item.rewards) ? item.rewards : [];
  const rewardsApr = rewards.reduce(
    (sum, reward) => sum + (parseFiniteNumber(reward?.supplyApr) ?? 0),
    0,
  );
  const total = baseApy + rewardsApr;
  return Number.isFinite(total) ? total : null;
}

export async function getMorphoVaultAprFromApi(
  chainId: number,
  params: {
    vaultAddress?: string | null;
    search?: string | null;
    exactName?: string | null;
    assetSymbol?: string | null;
  },
): Promise<bigint | null> {
  const vaultAddress = params.vaultAddress ? parseAddressRef(params.vaultAddress) : null;
  const search = typeof params.search === "string" ? params.search.trim() : "";
  const exactName = typeof params.exactName === "string" ? params.exactName.trim().toLowerCase() : "";
  const assetSymbol = typeof params.assetSymbol === "string"
    ? params.assetSymbol.trim().toLowerCase()
    : "";

  if (!vaultAddress && !search) return null;

  const cacheKey = [
    String(chainId),
    vaultAddress?.toLowerCase() ?? "",
    search.toLowerCase(),
    exactName,
    assetSymbol,
  ].join(":");
  const cached = morphoApiCache.get(cacheKey);
  const now = Date.now();
  if (cached && now - cached.fetchedAt <= MORPHO_API_CACHE_TTL_MS) {
    return cached.apr === null ? null : aprFloatToRaw(cached.apr);
  }

  try {
    let items: MorphoVaultApiItem[] = [];

    if (vaultAddress) {
      const queryV1 = `
        query MorphoVaultByAddress($address: String!, $chainId: Int!) {
          vaultByAddress(address: $address, chainId: $chainId) {
            address
            name
            symbol
            asset { symbol }
            state {
              avgNetApy(lookback: ONE_DAY)
              avgNetApyExcludingRewards(lookback: ONE_DAY)
              netApy
              netApyExcludingRewards
              allRewards {
                supplyApr
              }
            }
          }
        }
      `;

      const responseV1 = await fetch(MORPHO_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: queryV1, variables: { address: vaultAddress, chainId } }),
      });
      if (responseV1.ok) {
        const payload = await responseV1.json() as {
          data?: { vaultByAddress?: MorphoVaultApiItem | null };
          errors?: unknown[];
        };
        if (!Array.isArray(payload.errors) || payload.errors.length === 0) {
          if (payload.data?.vaultByAddress) {
            items = [payload.data.vaultByAddress];
          }
        }
      }

      if (!items.length) {
        const queryV2 = `
          query MorphoVaultV2ByAddress($address: String!, $chainId: Int!) {
            vaultV2ByAddress(address: $address, chainId: $chainId) {
              address
              name
              symbol
              asset { symbol }
              avgNetApy(lookback: ONE_DAY)
              avgNetApyExcludingRewards(lookback: ONE_DAY)
              netApy
              netApyExcludingRewards
              rewards {
                supplyApr
              }
            }
          }
        `;
        const responseV2 = await fetch(MORPHO_API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: queryV2, variables: { address: vaultAddress, chainId } }),
        });
        if (!responseV2.ok) return null;
        const payloadV2 = await responseV2.json() as {
          data?: { vaultV2ByAddress?: MorphoVaultV2ApiItem | null };
          errors?: unknown[];
        };
        if (Array.isArray(payloadV2.errors) && payloadV2.errors.length > 0) return null;
        const apr = morphoVaultV2ItemTotalApr(payloadV2.data?.vaultV2ByAddress);
        morphoApiCache.set(cacheKey, { fetchedAt: now, apr });
        return apr === null ? null : aprFloatToRaw(apr);
      }
    } else {
      const query = `
        query MorphoVaultSearch($search: String!) {
          vaults(first: 20, where: { chainId_in: [${chainId}], search: $search }) {
            items {
              address
              name
              symbol
              asset { symbol }
              state {
                avgNetApy(lookback: ONE_DAY)
                avgNetApyExcludingRewards(lookback: ONE_DAY)
                netApy
                netApyExcludingRewards
                allRewards {
                  supplyApr
                }
              }
            }
          }
        }
      `;
      const response = await fetch(MORPHO_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables: { search } }),
      });
      if (!response.ok) return null;
      const payload = await response.json() as {
        data?: { vaults?: { items?: MorphoVaultApiItem[] | null } | null };
        errors?: unknown[];
      };
      if (Array.isArray(payload.errors) && payload.errors.length > 0) return null;
      items = Array.isArray(payload.data?.vaults?.items) ? payload.data!.vaults!.items! : [];
    }

    if (!items.length) {
      morphoApiCache.set(cacheKey, { fetchedAt: now, apr: null });
      return null;
    }

    let candidates = items;
    if (exactName) {
      const exactMatches = candidates.filter((item) => (item.name ?? "").trim().toLowerCase() === exactName);
      if (exactMatches.length > 0) candidates = exactMatches;
    }
    if (assetSymbol) {
      const assetMatches = candidates.filter(
        (item) => (item.asset?.symbol ?? "").trim().toLowerCase() === assetSymbol,
      );
      if (assetMatches.length > 0) candidates = assetMatches;
    }

    candidates = [...candidates].sort((a, b) => {
      const aprA = morphoVaultItemTotalApr(a) ?? Number.NEGATIVE_INFINITY;
      const aprB = morphoVaultItemTotalApr(b) ?? Number.NEGATIVE_INFINITY;
      return aprB - aprA;
    });

    const apr = morphoVaultItemTotalApr(candidates[0]);
    morphoApiCache.set(cacheKey, { fetchedAt: now, apr });
    return apr === null ? null : aprFloatToRaw(apr);
  } catch {
    return null;
  }
}

export function katanaVaultTotalApr(snapshot: KatanaVaultSnapshot | null | undefined): number | null {
  const performance = snapshot?.performance;
  const estimated = performance?.estimated;
  const oracle = performance?.oracle;
  // Keep Katana's headline rate aligned with yearn.fi: forward estimates first,
  // then oracle and historical fallbacks.
  const baseApr = parseFiniteNumber(estimated?.apy)
    ?? parseFiniteNumber(estimated?.apr)
    ?? parseFiniteNumber(oracle?.netAPY)
    ?? parseFiniteNumber(oracle?.apy)
    ?? parseFiniteNumber(oracle?.netAPR)
    ?? parseFiniteNumber(oracle?.apr)
    ?? parseFiniteNumber(performance?.historical?.net);
  const rewardsApr = katanaVaultRewardsApr(snapshot);
  if (baseApr !== null || rewardsApr !== null) {
    const total = (baseApr ?? 0) + (rewardsApr ?? 0);
    if (Number.isFinite(total)) return total;
  }
  return baseApr;
}

function katanaVaultRewardsApr(snapshot: KatanaVaultSnapshot | null | undefined): number | null {
  const components = snapshot?.performance?.estimated?.components ?? {};
  const appRewards = parseFiniteNumber(components.katanaAppRewardsAPR);
  const fixedRate = parseFiniteNumber(components.fixedRateKatanaRewards);
  if (appRewards !== null || fixedRate !== null) {
    return (appRewards ?? 0) + (fixedRate ?? 0);
  }
  return null;
}

async function getKatanaVaultRecordFromApi(
  chainId: number,
  vaultAddress: string,
): Promise<KatanaVaultSnapshot | null> {
  let normalizedAddress: string;
  try {
    normalizedAddress = getAddress(vaultAddress).toLowerCase();
  } catch {
    return null;
  }

  const cacheKey = `${chainId}:${normalizedAddress}`;
  const now = Date.now();
  let cached = katanaApiCache.get(cacheKey);

  if (!cached || now - cached.fetchedAt > KATANA_APR_CACHE_TTL_MS) {
    try {
      const response = await fetch(`${KATANA_SNAPSHOT_API_BASE_URL}/${chainId}/${normalizedAddress}`, {
        method: "GET",
        headers: { accept: "application/json" },
      });
      if (!response.ok) return null;

      const payload = await response.json() as KatanaVaultSnapshot;
      cached = { fetchedAt: now, payload };
      katanaApiCache.set(cacheKey, cached);
    } catch {
      return null;
    }
  }

  return cached.payload ?? null;
}

export async function getKatanaVaultAprFromApi(
  chainId: number,
  vaultAddress: string,
): Promise<bigint | null> {
  const record = await getKatanaVaultRecordFromApi(chainId, vaultAddress);
  const apr = katanaVaultTotalApr(record);
  return apr === null ? null : aprFloatToRaw(apr);
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

async function getPendlePtToAssetRate(
  market: string,
  chainId: number,
  blockNumber?: bigint,
): Promise<bigint | null> {
  const client = getViemClient(chainId);
  if (!client) return null;

  const routerStatic = await getPendleRouterStatic(chainId);
  if (!routerStatic) return null;

  try {
    return await client.readContract({
      address: getAddress(routerStatic),
      abi: pendleRouterStaticAbi,
      functionName: "getPtToAssetRate",
      args: [getAddress(market)],
      ...(blockNumber !== undefined ? { blockNumber } : {}),
    });
  } catch {
    return null;
  }
}

async function getPendleOraclePtToAssetRate(
  oracle: string,
  market: string,
  chainId: number,
  twapDuration: number,
): Promise<bigint | null> {
  const client = getViemClient(chainId);
  if (!client) return null;
  try {
    return await client.readContract({
      address: getAddress(oracle),
      abi: pendleOracleAbi,
      functionName: "getPtToAssetRate",
      args: [getAddress(market), twapDuration],
    });
  } catch {
    return null;
  }
}

async function getPendleMarketExpiry(
  market: string,
  chainId: number,
): Promise<bigint | null> {
  const client = getViemClient(chainId);
  if (!client) return null;
  try {
    const isExpired = await client.readContract({
      address: getAddress(market),
      abi: pendleMarketExpiryAbi,
      functionName: "isExpired",
    });
    if (isExpired) return 0n;

    return await client.readContract({
      address: getAddress(market),
      abi: pendleMarketExpiryAbi,
      functionName: "expiry",
    });
  } catch {
    return null;
  }
}

async function getPendlePtOutForAssetIn(
  market: string,
  pendleToken: string,
  amountIn: bigint,
  chainId: number,
): Promise<bigint | null> {
  const client = getViemClient(chainId);
  if (!client) return null;
  const routerStatic = await getPendleRouterStatic(chainId);
  if (!routerStatic) return null;

  try {
    const result = await client.readContract({
      address: getAddress(routerStatic),
      abi: pendleRouterStaticAbi,
      functionName: "swapExactTokenForPtStatic",
      args: [getAddress(market), getAddress(pendleToken), amountIn],
    }) as readonly [bigint, bigint, bigint, bigint, bigint];
    return result[0];
  } catch {
    return null;
  }
}

async function getPendleAssetOutForPtIn(
  market: string,
  pendleToken: string,
  ptIn: bigint,
  chainId: number,
): Promise<bigint | null> {
  const client = getViemClient(chainId);
  if (!client) return null;
  const routerStatic = await getPendleRouterStatic(chainId);
  if (!routerStatic) return null;

  try {
    const result = await client.readContract({
      address: getAddress(routerStatic),
      abi: pendleRouterStaticAbi,
      functionName: "swapExactPtForTokenStatic",
      args: [getAddress(market), ptIn, getAddress(pendleToken)],
    }) as readonly [bigint, bigint, bigint, bigint, bigint];
    return result[0];
  } catch {
    return null;
  }
}

export interface PendlePtFixedAprParams {
  strategy?: string | null;
  pt?: string | null;
  market?: string | null;
  oracle?: string | null;
  pendleToken?: string | null;
  debtChange?: bigint;
  twapDuration?: number;
}

export async function getPendlePtFixedApr(
  chainId: number,
  params: PendlePtFixedAprParams,
): Promise<{ aprRaw: bigint; market: string | null; pt: string | null } | null> {
  const strategy = normalizeAddressOrNull(params.strategy);
  let pt = normalizeAddressOrNull(params.pt);
  let market = normalizeAddressOrNull(params.market);
  let oracle = normalizeAddressOrNull(params.oracle);
  let pendleToken = normalizeAddressOrNull(params.pendleToken);

  if (!pt && strategy) {
    pt = await getStrategyPendlePrincipalToken(strategy, chainId);
  }

  if (!market && strategy && pt) {
    market = await getStrategyPendleMarketForPt(strategy, pt, chainId);
  }
  if (!market && strategy) {
    market = await getStrategyPendleMarket(strategy, chainId);
  }
  if (!market && pt) {
    const api = await getPendleMarketApyFromApi(chainId, pt);
    market = api.market;
  }
  if (!market && pt) {
    market = await getStrategyPendleMarket(pt, chainId);
  }
  if (!market) return null;

  if (!oracle && strategy) {
    oracle = await getStrategyPendleOracle(strategy, chainId);
  }
  if (!pendleToken && strategy) {
    pendleToken = await getStrategyPendleToken(strategy, chainId);
  }

  const requestedTwapDuration = Number(params.twapDuration ?? 1800);
  const twapDuration = Number.isFinite(requestedTwapDuration) && requestedTwapDuration > 0
    ? requestedTwapDuration
    : 1800;
  let ptToAssetRate = oracle
    ? await getPendleOraclePtToAssetRate(oracle, market, chainId, twapDuration)
    : null;
  if (ptToAssetRate === null) {
    ptToAssetRate = await getPendlePtToAssetRate(market, chainId);
  }
  if (ptToAssetRate === null || ptToAssetRate <= 0n) return null;

  let ptPerAsset = (ONE * ONE) / ptToAssetRate;
  const debtChange = params.debtChange ?? 0n;

  if (debtChange > 0n && pendleToken) {
    const ptOut = await getPendlePtOutForAssetIn(market, pendleToken, debtChange, chainId);
    if (ptOut !== null) {
      if (ptOut === 0n) return { aprRaw: 0n, market, pt };
      ptPerAsset = (ptOut * ONE) / debtChange;
    }
  } else if (debtChange < 0n && pendleToken) {
    const assetAmount = -debtChange;
    const ptIn = (assetAmount * ptPerAsset) / ONE;
    if (ptIn === 0n) return { aprRaw: 0n, market, pt };

    const assetOut = await getPendleAssetOutForPtIn(market, pendleToken, ptIn, chainId);
    if (assetOut !== null) {
      if (assetOut === 0n) return { aprRaw: 0n, market, pt };
      ptPerAsset = (ptIn * ONE) / assetOut;
    }
  }

  if (ptPerAsset <= ONE) return { aprRaw: 0n, market, pt };

  const expiry = await getPendleMarketExpiry(market, chainId);
  if (expiry === null) return null;
  if (expiry <= 0n) return { aprRaw: 0n, market, pt };

  const client = getViemClient(chainId);
  if (!client) return null;
  let timestamp: bigint;
  try {
    const block = await client.getBlock();
    timestamp = block.timestamp;
  } catch {
    return null;
  }
  if (expiry <= timestamp) return { aprRaw: 0n, market, pt };

  const timeToExpiry = expiry - timestamp;
  const aprRaw = ((ptPerAsset - ONE) * BigInt(SECONDS_PER_YEAR)) / timeToExpiry;
  return { aprRaw, market, pt };
}

export async function getPendlePtRealizedApy(
  market: string,
  chainId: number,
  windowSeconds: number,
): Promise<bigint | null> {
  if (windowSeconds <= 0) return null;

  const bounds = await getHistoricalWindowBounds(chainId, windowSeconds);
  if (!bounds) return null;

  const [currentRate, oldRate] = await Promise.all([
    getPendlePtToAssetRate(market, chainId, bounds.latestBlockNumber),
    getPendlePtToAssetRate(market, chainId, bounds.oldBlockNumber),
  ]);
  if (currentRate === null || oldRate === null) return null;

  return annualizeRawGrowth(currentRate, oldRate, bounds.elapsedSeconds);
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

async function getMorphoMarketBorrowIndex(
  morpho: string,
  marketId: string,
  chainId: number,
  blockNumber?: bigint,
): Promise<bigint | null> {
  const client = getViemClient(chainId);
  if (!client) return null;

  try {
    const market = await client.readContract({
      address: getAddress(morpho),
      abi: morphoMarketAbi,
      functionName: "market",
      args: [marketId as `0x${string}`],
      ...(blockNumber !== undefined ? { blockNumber } : {}),
    });

    const totalBorrowAssets = market[2];
    const totalBorrowShares = market[3];
    if (totalBorrowAssets <= 0n || totalBorrowShares <= 0n) return null;

    return (BigInt(totalBorrowAssets) * ONE) / BigInt(totalBorrowShares);
  } catch {
    return null;
  }
}

export async function getMorphoMarketHistoricalBorrowApy(
  morpho: string,
  marketId: string,
  chainId: number,
  windowSeconds: number,
): Promise<bigint | null> {
  if (windowSeconds <= 0) return null;

  const bounds = await getHistoricalWindowBounds(chainId, windowSeconds);
  if (!bounds) return null;

  const [currentIndex, oldIndex] = await Promise.all([
    getMorphoMarketBorrowIndex(morpho, marketId, chainId, bounds.latestBlockNumber),
    getMorphoMarketBorrowIndex(morpho, marketId, chainId, bounds.oldBlockNumber),
  ]);
  if (currentIndex === null || oldIndex === null) return null;

  return annualizeRawGrowth(currentIndex, oldIndex, bounds.elapsedSeconds);
}

export async function getAavePoolAssetHistoricalSupplyApy(
  pool: string,
  asset: string,
  chainId: number,
  windowSeconds: number,
): Promise<bigint | null> {
  if (windowSeconds <= 0) return null;

  const client = getViemClient(chainId);
  if (!client) return null;

  const bounds = await getHistoricalWindowBounds(chainId, windowSeconds);
  if (!bounds) return null;

  try {
    const [currentIndex, oldIndex] = await Promise.all([
      client.readContract({
        address: getAddress(pool),
        abi: aavePoolAbi,
        functionName: "getReserveNormalizedIncome",
        args: [getAddress(asset)],
        blockNumber: bounds.latestBlockNumber,
      }),
      client.readContract({
        address: getAddress(pool),
        abi: aavePoolAbi,
        functionName: "getReserveNormalizedIncome",
        args: [getAddress(asset)],
        blockNumber: bounds.oldBlockNumber,
      }),
    ]);
    return annualizeRawGrowth(currentIndex, oldIndex, bounds.elapsedSeconds);
  } catch {
    return null;
  }
}

export async function getAavePoolAssetCurrentSupplyApy(
  pool: string,
  asset: string,
  chainId: number,
): Promise<bigint | null> {
  const client = getViemClient(chainId);
  if (!client) return null;

  try {
    const reserveData = await client.readContract({
      address: getAddress(pool),
      abi: aavePoolAbi,
      functionName: "getReserveData",
      args: [getAddress(asset)],
    });
    return rayAnnualRateToApyRaw(BigInt(reserveData[2]));
  } catch {
    return null;
  }
}

export async function getAavePoolAssetHistoricalBorrowApy(
  pool: string,
  asset: string,
  chainId: number,
  windowSeconds: number,
): Promise<bigint | null> {
  if (windowSeconds <= 0) return null;

  const client = getViemClient(chainId);
  if (!client) return null;

  const bounds = await getHistoricalWindowBounds(chainId, windowSeconds);
  if (!bounds) return null;

  try {
    const [currentIndex, oldIndex] = await Promise.all([
      client.readContract({
        address: getAddress(pool),
        abi: aavePoolAbi,
        functionName: "getReserveNormalizedVariableDebt",
        args: [getAddress(asset)],
        blockNumber: bounds.latestBlockNumber,
      }),
      client.readContract({
        address: getAddress(pool),
        abi: aavePoolAbi,
        functionName: "getReserveNormalizedVariableDebt",
        args: [getAddress(asset)],
        blockNumber: bounds.oldBlockNumber,
      }),
    ]);
    return annualizeRawGrowth(currentIndex, oldIndex, bounds.elapsedSeconds);
  } catch {
    return null;
  }
}

export async function getAavePoolAssetCurrentBorrowApy(
  pool: string,
  asset: string,
  chainId: number,
): Promise<bigint | null> {
  const client = getViemClient(chainId);
  if (!client) return null;

  try {
    const reserveData = await client.readContract({
      address: getAddress(pool),
      abi: aavePoolAbi,
      functionName: "getReserveData",
      args: [getAddress(asset)],
    });
    return rayAnnualRateToApyRaw(BigInt(reserveData[4]));
  } catch {
    return null;
  }
}

export async function getAaveReserveHistoricalSupplyApy(
  aToken: string,
  chainId: number,
  windowSeconds: number,
): Promise<bigint | null> {
  if (windowSeconds <= 0) return null;

  const client = getViemClient(chainId);
  if (!client) return null;

  const context = await getAaveReserveContext(aToken, chainId);
  if (!context) return null;

  const bounds = await getHistoricalWindowBounds(chainId, windowSeconds);
  if (!bounds) return null;

  try {
    const [currentIndex, oldIndex] = await Promise.all([
      client.readContract({
        address: getAddress(context.pool),
        abi: aavePoolAbi,
        functionName: "getReserveNormalizedIncome",
        args: [getAddress(context.asset)],
        blockNumber: bounds.latestBlockNumber,
      }),
      client.readContract({
        address: getAddress(context.pool),
        abi: aavePoolAbi,
        functionName: "getReserveNormalizedIncome",
        args: [getAddress(context.asset)],
        blockNumber: bounds.oldBlockNumber,
      }),
    ]);
    return annualizeRawGrowth(currentIndex, oldIndex, bounds.elapsedSeconds);
  } catch {
    return null;
  }
}

export async function getAaveReserveHistoricalBorrowApy(
  aToken: string,
  chainId: number,
  windowSeconds: number,
): Promise<bigint | null> {
  if (windowSeconds <= 0) return null;

  const client = getViemClient(chainId);
  if (!client) return null;

  const context = await getAaveReserveContext(aToken, chainId);
  if (!context) return null;

  const bounds = await getHistoricalWindowBounds(chainId, windowSeconds);
  if (!bounds) return null;

  try {
    const [currentIndex, oldIndex] = await Promise.all([
      client.readContract({
        address: getAddress(context.pool),
        abi: aavePoolAbi,
        functionName: "getReserveNormalizedVariableDebt",
        args: [getAddress(context.asset)],
        blockNumber: bounds.latestBlockNumber,
      }),
      client.readContract({
        address: getAddress(context.pool),
        abi: aavePoolAbi,
        functionName: "getReserveNormalizedVariableDebt",
        args: [getAddress(context.asset)],
        blockNumber: bounds.oldBlockNumber,
      }),
    ]);
    return annualizeRawGrowth(currentIndex, oldIndex, bounds.elapsedSeconds);
  } catch {
    return null;
  }
}

export async function getAaveAssetHistoricalBorrowApy(
  asset: string,
  chainId: number,
  windowSeconds: number,
): Promise<bigint | null> {
  if (windowSeconds <= 0) return null;

  const client = getViemClient(chainId);
  if (!client) return null;

  const context = await getAaveAssetContext(asset, chainId);
  if (!context) return null;

  const bounds = await getHistoricalWindowBounds(chainId, windowSeconds);
  if (!bounds) return null;

  try {
    const [currentIndex, oldIndex] = await Promise.all([
      client.readContract({
        address: getAddress(context.pool),
        abi: aavePoolAbi,
        functionName: "getReserveNormalizedVariableDebt",
        args: [getAddress(context.asset)],
        blockNumber: bounds.latestBlockNumber,
      }),
      client.readContract({
        address: getAddress(context.pool),
        abi: aavePoolAbi,
        functionName: "getReserveNormalizedVariableDebt",
        args: [getAddress(context.asset)],
        blockNumber: bounds.oldBlockNumber,
      }),
    ]);
    return annualizeRawGrowth(currentIndex, oldIndex, bounds.elapsedSeconds);
  } catch {
    return null;
  }
}

export async function getAaveReserveCurrentSupplyApy(
  aToken: string,
  chainId: number,
): Promise<bigint | null> {
  const client = getViemClient(chainId);
  if (!client) return null;

  const context = await getAaveReserveContext(aToken, chainId);
  if (!context) return null;

  try {
    const reserveData = await client.readContract({
      address: getAddress(context.pool),
      abi: aavePoolAbi,
      functionName: "getReserveData",
      args: [getAddress(context.asset)],
    });
    return rayAnnualRateToApyRaw(BigInt(reserveData[2]));
  } catch {
    return null;
  }
}

export async function getAaveReserveCurrentBorrowApy(
  aToken: string,
  chainId: number,
): Promise<bigint | null> {
  const client = getViemClient(chainId);
  if (!client) return null;

  const context = await getAaveReserveContext(aToken, chainId);
  if (!context) return null;

  try {
    const reserveData = await client.readContract({
      address: getAddress(context.pool),
      abi: aavePoolAbi,
      functionName: "getReserveData",
      args: [getAddress(context.asset)],
    });
    return rayAnnualRateToApyRaw(BigInt(reserveData[4]));
  } catch {
    return null;
  }
}

export async function getAaveAssetCurrentBorrowApy(
  asset: string,
  chainId: number,
): Promise<bigint | null> {
  const client = getViemClient(chainId);
  if (!client) return null;

  const context = await getAaveAssetContext(asset, chainId);
  if (!context) return null;

  try {
    const reserveData = await client.readContract({
      address: getAddress(context.pool),
      abi: aavePoolAbi,
      functionName: "getReserveData",
      args: [getAddress(context.asset)],
    });
    return rayAnnualRateToApyRaw(BigInt(reserveData[4]));
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

async function getHistoricalWindowBounds(
  chainId: number,
  windowSeconds: number,
): Promise<{
  latestBlockNumber: bigint;
  oldBlockNumber: bigint;
  elapsedSeconds: number;
} | null> {
  if (windowSeconds <= 0) return null;

  const client = getViemClient(chainId);
  if (!client) return null;

  let latestBlockNumber: bigint;
  try {
    latestBlockNumber = await client.getBlockNumber();
  } catch {
    return null;
  }
  if (latestBlockNumber <= 0n) return null;

  const latestBlock = await getBlock(chainId, latestBlockNumber);
  if (!latestBlock || latestBlock.timestamp <= 0n) return null;

  const targetTs = latestBlock.timestamp - BigInt(windowSeconds);
  if (targetTs <= 0n) return null;

  const oldBlockNumber = await findBlockAtOrBeforeTimestamp(chainId, targetTs, latestBlockNumber);
  if (oldBlockNumber === null) return null;

  const oldBlock = await getBlock(chainId, oldBlockNumber);
  if (!oldBlock) return null;

  const elapsedSeconds = Number(latestBlock.timestamp - oldBlock.timestamp);
  if (elapsedSeconds <= 0) return null;

  return {
    latestBlockNumber,
    oldBlockNumber,
    elapsedSeconds,
  };
}

async function historicalConvertToAssetsAprForWindow(
  vault: string,
  chainId: number,
  windowSeconds: number,
  sharesRaw: bigint,
): Promise<bigint | null> {
  if (windowSeconds <= 0 || sharesRaw <= 0n) return null;

  const bounds = await getHistoricalWindowBounds(chainId, windowSeconds);
  if (!bounds) return null;

  const latestAssets = await getErc4626ConvertToAssets(
    vault,
    chainId,
    sharesRaw,
    bounds.latestBlockNumber,
  );
  const oldAssets = await getErc4626ConvertToAssets(
    vault,
    chainId,
    sharesRaw,
    bounds.oldBlockNumber,
  );
  if (latestAssets === null || oldAssets === null || oldAssets <= 0n) return null;

  return annualizeRawGrowth(latestAssets, oldAssets, bounds.elapsedSeconds);
}

export async function getHistoricalConvertToAssetsApr(
  vault: string,
  chainId: number,
  windowSeconds: number,
  sharesRaw: bigint,
): Promise<bigint | null> {
  return historicalConvertToAssetsAprForWindow(vault, chainId, windowSeconds, sharesRaw);
}

export async function getOracleGrowthApr(
  oracleAddress: string,
  chainId: number,
  windowSeconds: number = DEFAULT_HISTORICAL_WINDOW_SECONDS,
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
      functionName: "withdrawalWindow",
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
