import { getViemClient } from "./onchain";

export interface StrategyChangedEvent {
  strategy: string;
  changeType: number;
  blockNumber: number;
}

const CHUNK_SIZE = 5_000;

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
  return fetchViaRpc(chainId, vaultAddress, fromBlock);
}
