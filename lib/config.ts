import fs from "fs";
import path from "path";
import YAML from "yaml";

export interface SourceRef {
  kind: "onchain" | "offchain";
  name: string;
  params?: Record<string, unknown>;
}

export interface StrategyConfig {
  id: string;
  type: string;
  sources: SourceRef[];
  params: Record<string, unknown>;
}

export interface VaultConfig {
  name: string;
  symbol: string;
  address: string;
  chain_id: number;
  strategies: StrategyConfig[];
}

export interface ChainSourceConfig {
  rpc_url_env?: string;
  rpc_url?: string;
  poa?: boolean;
  apr_oracle_address?: string;
}

export interface OnchainSourceConfig {
  rpc_url_env?: string;
  rpc_url?: string;
  apr_oracle_address?: string;
  chains?: Record<string, ChainSourceConfig>;
}

export interface StrategyCacheConfig {
  start_block: number;
  chunk_size: number;
  defaults: Record<string, unknown>;
  hardcoded_aprs: Record<string, unknown>;
  strategies: Record<string, unknown>;
  chains: Record<string, { start_block?: number }>;
  vaults: Record<string, { start_block?: number }>;
}

export interface AprConfig {
  enabled: boolean;
  vaults: VaultConfig[];
  sources: Record<string, OnchainSourceConfig>;
  strategy_cache: StrategyCacheConfig;
}

export interface ServiceConfig {
  apr: AprConfig;
}

let _cached: ServiceConfig | null = null;

export function loadServiceConfig(
  configPath?: string,
): ServiceConfig {
  if (_cached) return _cached;
  const resolved = configPath ?? path.join(process.cwd(), "config", "config.yaml");
  const raw = YAML.parse(fs.readFileSync(resolved, "utf-8")) as Record<string, unknown>;
  _cached = raw as unknown as ServiceConfig;
  return _cached;
}
