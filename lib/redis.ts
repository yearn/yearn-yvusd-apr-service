import Redis from "ioredis";
import type { VaultAprResult } from "./models";

const CACHE_KEY = "yvusd:strategy_cache";
const APR_RESULT_KEY = "yvusd:apr_result";
const VAULT_APR_PREFIX = "yvusd:vault_apr:";

let _client: Redis | null = null;

function getClient(): Redis {
  if (!_client) {
    const url = process.env.REDIS_URL;
    if (!url) throw new Error("REDIS_URL is not set");
    _client = new Redis(url, { maxRetriesPerRequest: 3, lazyConnect: true });
  }
  return _client;
}

export async function readCache(): Promise<Record<string, unknown> | null> {
  const raw = await getClient().get(CACHE_KEY);
  if (!raw) return null;
  return JSON.parse(raw) as Record<string, unknown>;
}

export async function writeCache(data: Record<string, unknown>): Promise<void> {
  await getClient().set(CACHE_KEY, JSON.stringify(data));
}

export async function clearCache(): Promise<void> {
  await getClient().del(CACHE_KEY);
}

export async function readAprResult(): Promise<Record<string, unknown> | null> {
  const raw = await getClient().get(APR_RESULT_KEY);
  if (!raw) return null;
  return JSON.parse(raw) as Record<string, unknown>;
}

export async function writeAprResult(data: Record<string, unknown>): Promise<void> {
  const pipeline = getClient().pipeline();
  pipeline.set(APR_RESULT_KEY, JSON.stringify(data));
  for (const [address, vault] of Object.entries(data)) {
    pipeline.set(`${VAULT_APR_PREFIX}${address.toLowerCase()}`, JSON.stringify(vault));
  }
  await pipeline.exec();
}

export async function readVaultAprs(addresses: string[]): Promise<(VaultAprResult | null)[]> {
  if (addresses.length === 0) return [];
  const keys = addresses.map((a) => `${VAULT_APR_PREFIX}${a.toLowerCase()}`);
  const values = await getClient().mget(...keys);
  return values.map((raw) => (raw ? (JSON.parse(raw) as VaultAprResult) : null));
}

/* ── Borrow Rate Smoothing (per-market 24h rolling average) ── */

export async function recordBorrowRate(
  morpho: string,
  marketId: string,
  chainId: number,
  rate: bigint,
): Promise<void> {
  const key = `yvusd:borrow_rate:${chainId}:${morpho.toLowerCase()}:${marketId.toLowerCase()}`;
  const now = Math.floor(Date.now() / 1000);
  const member = JSON.stringify({ timestamp: now, rate: rate.toString() });
  const pipeline = getClient().pipeline();
  pipeline.zadd(key, now, member);
  pipeline.zremrangebyscore(key, "-inf", now - 25 * 60 * 60);
  await pipeline.exec();
}

export async function getAverageBorrowRate(
  morpho: string,
  marketId: string,
  chainId: number,
  windowSeconds = 24 * 60 * 60,
): Promise<bigint | null> {
  const key = `yvusd:borrow_rate:${chainId}:${morpho.toLowerCase()}:${marketId.toLowerCase()}`;
  const cutoff = Math.floor(Date.now() / 1000) - windowSeconds;
  const members = await getClient().zrangebyscore(key, cutoff, "+inf");
  if (!members.length) return null;
  let sum = 0n;
  for (const m of members) sum += BigInt(JSON.parse(m).rate);
  return sum / BigInt(members.length);
}
