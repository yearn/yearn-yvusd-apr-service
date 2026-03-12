export interface AprComponent {
  label: string;
  apr: number;
  apy: number;
  source: string;
  meta?: Record<string, unknown>;
}

export interface VaultAprResult {
  name: string;
  symbol: string;
  address: string;
  chain_id: number;
  apr: number;
  apy: number;
  components: AprComponent[];
  meta?: Record<string, unknown>;
  computed_at?: string;
}

export interface AprResultEnvelope {
  vaults: Record<string, VaultAprResult>;
  computed_at: string;
}
