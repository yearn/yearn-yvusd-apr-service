import Redis from "ioredis";
import type { VaultAprResult, AprComponent } from "./models";

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

/* ── APR History (sorted sets for rolling average) ── */

const APR_HISTORY_PREFIX = "yvusd:apr_history:";
const HISTORY_WINDOW_MS = 4 * 60 * 60 * 1000; // 4 hours

export async function pushAprSnapshot(address: string, apr: number, apy: number): Promise<void> {
  const key = `${APR_HISTORY_PREFIX}${address.toLowerCase()}`;
  const now = Date.now();
  const value = JSON.stringify({ apr, apy, t: now });
  const pipeline = getClient().pipeline();
  pipeline.zadd(key, now, value);
  // prune entries older than 24h
  pipeline.zremrangebyscore(key, 0, now - HISTORY_WINDOW_MS);
  await pipeline.exec();
}

export async function enrichComponentsWithSmoothed(address: string, components: AprComponent[]): Promise<void> {
  for (const component of components) {
    const smoothed = await getSmoothedApr(`${address}:${component.label}`);
    if (smoothed && smoothed.samples > 1) {
      component.apr = smoothed.apr;
      component.apy = smoothed.apy;
    }
  }
}

export async function getSmoothedApr(address: string): Promise<{ apr: number; apy: number; samples: number } | null> {
  const key = `${APR_HISTORY_PREFIX}${address.toLowerCase()}`;
  const now = Date.now();
  const entries = await getClient().zrangebyscore(key, now - HISTORY_WINDOW_MS, now);
  if (entries.length === 0) return null;

  let aprSum = 0;
  let apySum = 0;
  for (const raw of entries) {
    const entry = JSON.parse(raw) as { apr: number; apy: number; t: number };
    aprSum += entry.apr;
    apySum += entry.apy;
  }

  return {
    apr: aprSum / entries.length,
    apy: apySum / entries.length,
    samples: entries.length,
  };
}
