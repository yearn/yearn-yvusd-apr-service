import { HypersyncClient, type Query } from "@envio-dev/hypersync-client";
import { toEventSelector } from "viem";
import { getViemClient } from "./onchain";

export interface StrategyChangedEvent {
  strategy: string;
  changeType: number;
  blockNumber: number;
}

const STRATEGY_CHANGED_TOPIC0 = toEventSelector(
  "StrategyChanged(address,uint256)",
);

const HYPERSYNC_URLS: Record<number, string> = {
  1: "https://eth.hypersync.xyz",
  42161: "https://arbitrum.hypersync.xyz",
};

const CHUNK_SIZE = 5_000;

function parseAddress(topic: string): string {
  return "0x" + topic.slice(-40).toLowerCase();
}

function parseBigIntTopic(topic: string): number {
  return Number(BigInt(topic));
}

async function fetchViaHypersync(
  chainId: number,
  vaultAddress: string,
  fromBlock: number,
): Promise<{ events: StrategyChangedEvent[]; lastBlock: number }> {
  const url = HYPERSYNC_URLS[chainId];
  if (!url) throw new Error(`No HyperSync URL for chain ${chainId}`);

  const client = new HypersyncClient({
    url,
    apiToken: process.env.HYPERSYNC_API_TOKEN ?? "",
  });

  const query: Query = {
    fromBlock,
    logs: [
      {
        address: [vaultAddress],
        topics: [[STRATEGY_CHANGED_TOPIC0], [], [], []],
      },
    ],
    fieldSelection: {
      log: [
        "BlockNumber",
        "Topic0",
        "Topic1",
        "Topic2",
      ],
    },
  };

  const events: StrategyChangedEvent[] = [];
  let lastBlock = fromBlock;

  let nextBlock = fromBlock;
  while (true) {
    const response = await client.get({ ...query, fromBlock: nextBlock });

    for (const log of response.data.logs) {
      const topics = log.topics;
      if (topics.length < 3) continue;
      const t0 = topics[0];
      const t1 = topics[1];
      const t2 = topics[2];
      if (!t0 || !t1 || !t2) continue;
      if (t0.toLowerCase() !== STRATEGY_CHANGED_TOPIC0.toLowerCase()) continue;

      events.push({
        strategy: parseAddress(t1),
        changeType: parseBigIntTopic(t2),
        blockNumber: Number(log.blockNumber ?? 0),
      });
    }

    const archiveHeight = response.archiveHeight ?? 0;
    const nextBlockFromResp = response.nextBlock;

    if (nextBlockFromResp > lastBlock) lastBlock = nextBlockFromResp;
    if (archiveHeight > lastBlock) lastBlock = archiveHeight;

    if (nextBlockFromResp === 0 || nextBlockFromResp >= archiveHeight) break;
    nextBlock = nextBlockFromResp;
  }

  events.sort((a, b) => a.blockNumber - b.blockNumber);
  return { events, lastBlock };
}

async function fetchViaRpc(
  chainId: number,
  vaultAddress: string,
  fromBlock: number,
): Promise<{ events: StrategyChangedEvent[]; lastBlock: number }> {
  const client = getViemClient(chainId);
  if (!client) throw new Error(`No RPC client for chain ${chainId}`);

  const latestBlock = Number(await client.getBlockNumber());
  if (fromBlock > latestBlock) return { events: [], lastBlock: latestBlock };

  const events: StrategyChangedEvent[] = [];
  let cursor = fromBlock;

  while (cursor <= latestBlock) {
    const toBlock = Math.min(cursor + CHUNK_SIZE - 1, latestBlock);
    const logs = await client.getLogs({
      address: vaultAddress as `0x${string}`,
      event: {
        type: "event",
        name: "StrategyChanged",
        inputs: [
          { name: "strategy", type: "address", indexed: true },
          { name: "change_type", type: "uint256", indexed: true },
        ],
      },
      fromBlock: BigInt(cursor),
      toBlock: BigInt(toBlock),
    });

    for (const log of logs) {
      events.push({
        strategy: (log.args.strategy as string).toLowerCase(),
        changeType: Number(log.args.change_type ?? 0),
        blockNumber: Number(log.blockNumber ?? 0),
      });
    }

    cursor = toBlock + 1;
  }

  events.sort((a, b) => a.blockNumber - b.blockNumber);
  return { events, lastBlock: latestBlock };
}

export async function fetchStrategyChangedEvents(
  chainId: number,
  vaultAddress: string,
  fromBlock: number,
): Promise<{ events: StrategyChangedEvent[]; lastBlock: number }> {
  const hasHypersyncToken = Boolean((process.env.HYPERSYNC_API_TOKEN ?? "").trim());
  if (HYPERSYNC_URLS[chainId] && hasHypersyncToken) {
    try {
      return await fetchViaHypersync(chainId, vaultAddress, fromBlock);
    } catch {
      return fetchViaRpc(chainId, vaultAddress, fromBlock);
    }
  }
  return fetchViaRpc(chainId, vaultAddress, fromBlock);
}
