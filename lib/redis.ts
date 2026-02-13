import Redis from "ioredis";

const CACHE_KEY = "yvusd:strategy_cache";
const APR_RESULT_KEY = "yvusd:apr_result";

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

export async function readAprResult(): Promise<Record<string, unknown> | null> {
  const raw = await getClient().get(APR_RESULT_KEY);
  if (!raw) return null;
  return JSON.parse(raw) as Record<string, unknown>;
}

export async function writeAprResult(data: Record<string, unknown>): Promise<void> {
  await getClient().set(APR_RESULT_KEY, JSON.stringify(data));
}
