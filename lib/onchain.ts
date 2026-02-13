import {
  createPublicClient,
  http,
  parseAbi,
  type PublicClient,
  type Address,
  getAddress,
} from "viem";
import { mainnet, arbitrum, type Chain } from "viem/chains";
import type { OnchainSourceConfig } from "./config";

const chainDefs: Record<number, Chain> = {
  1: mainnet,
  42161: arbitrum,
};

const nameAbi = parseAbi(["function name() view returns (string)"]);

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
const marketIdAbi = parseAbi([
  "function marketId() view returns (bytes32)",
]);
const collateralTokenAbi = parseAbi([
  "function collateralToken() view returns (address)",
]);

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
    const morphoAddr = await probeAddress(addr, chainId, morphoAbi, "morpho");
    const aTokenAddr = await probeAddress(addr, chainId, aTokenAbi, "aToken");
    const pendleAddr = await probeAddress(
      addr,
      chainId,
      pendleRouterAbi,
      "pendleRouter",
    );
    const marketId = await probeBytes32(addr, chainId, marketIdAbi, "marketId");

    let baseType = "looper";
    if (morphoAddr !== null) {
      baseType = "morpho-looper";
      meta.morpho = morphoAddr;
      if (marketId) meta.market_id = marketId;
    } else if (aTokenAddr !== null) {
      baseType = "aave-looper";
      meta.aToken = aTokenAddr;
    }

    if (pendleAddr !== null) {
      meta.pendle_router = pendleAddr;
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

  const pendleAddr = await probeAddress(
    addr,
    chainId,
    pendleRouterAbi,
    "pendleRouter",
  );
  if (pendleAddr !== null) {
    meta.type = "pt";
    meta.pendle_router = pendleAddr;
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
