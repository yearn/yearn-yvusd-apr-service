import { describe, it, expect, vi } from "vitest";
import type { KongBatchWebhook } from "./webhook-types";

vi.mock("./config", () => ({
  loadServiceConfig: () => ({
    apr: {
      enabled: true,
      vaults: [
        {
          name: "TestVault",
          symbol: "TV",
          address: "0x1111111111111111111111111111111111111111",
          chain_id: 747474,
          strategies: [],
        },
      ],
      sources: { onchain: {} },
      strategy_cache: {
        start_block: 0,
        chunk_size: 5000,
        defaults: {},
        hardcoded_aprs: {},
        strategies: {},
        chains: {},
        vaults: {},
      },
    },
  }),
}));

vi.mock("./apr-service", () => ({
  computeAllVaultsApr: vi.fn().mockResolvedValue({
    "0x1111111111111111111111111111111111111111": {
      name: "TestVault",
      symbol: "TV",
      address: "0x1111111111111111111111111111111111111111",
      chain_id: 747474,
      apr: 0.15,
      components: [
        { label: "net_apr", apr: 0.1, source: "onchain" },
        { label: "locker_bonus_apr", apr: 0.05, source: "onchain" },
      ],
    },
  }),
}));

const { computeKatanaAPR } = await import("./webhook-output");

function makeHook(overrides: Partial<KongBatchWebhook> = {}): KongBatchWebhook {
  return {
    abiPath: "yearn/3/vault",
    chainId: 747474,
    blockNumber: 12345n,
    blockTime: 1700000000n,
    subscription: {
      id: "S_KATANA_APR",
      url: "https://example.com/api/webhook",
      abiPath: "yearn/3/vault",
      type: "timeseries",
      labels: ["katana-apr"],
    },
    vaults: ["0x1111111111111111111111111111111111111111"],
    ...overrides,
  };
}

describe("computeKatanaAPR", () => {
  it("returns outputs for requested vaults", async () => {
    const outputs = await computeKatanaAPR(makeHook());

    expect(outputs.length).toBeGreaterThan(0);
    for (const output of outputs) {
      expect(output.chainId).toBe(747474);
      expect(output.label).toBe("katana-apr");
      expect(output.blockNumber).toBe(12345n);
      expect(output.blockTime).toBe(1700000000n);
    }
  });

  it("includes totalAPR component", async () => {
    const outputs = await computeKatanaAPR(makeHook());
    const totalAPR = outputs.find((o) => o.component === "totalAPR");
    expect(totalAPR).toBeDefined();
    expect(totalAPR!.value).toBe(0.15);
  });

  it("includes individual components", async () => {
    const outputs = await computeKatanaAPR(makeHook());
    const netApr = outputs.find((o) => o.component === "net_apr");
    expect(netApr).toBeDefined();
    expect(netApr!.value).toBe(0.1);
  });

  it("returns empty array for empty vaults list", async () => {
    const outputs = await computeKatanaAPR(makeHook({ vaults: [] }));
    expect(outputs).toEqual([]);
  });

  it("silently skips vaults not found in results", async () => {
    const outputs = await computeKatanaAPR(
      makeHook({ vaults: ["0x0000000000000000000000000000000000000000"] }),
    );
    expect(outputs).toEqual([]);
  });

  it("handles multiple vaults in batch", async () => {
    const outputs = await computeKatanaAPR(
      makeHook({
        vaults: [
          "0x1111111111111111111111111111111111111111",
          "0x0000000000000000000000000000000000000000",
        ],
      }),
    );
    const addresses = new Set(outputs.map((o) => o.address));
    expect(addresses.has("0x1111111111111111111111111111111111111111")).toBe(true);
    expect(addresses.has("0x0000000000000000000000000000000000000000")).toBe(false);
  });
});
