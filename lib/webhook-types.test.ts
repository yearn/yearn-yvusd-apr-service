import { describe, it, expect } from "vitest";
import {
  AddressSchema,
  KongBatchWebhookSchema,
  OutputSchema,
} from "./webhook-types";

describe("AddressSchema", () => {
  it("accepts valid address", () => {
    const result = AddressSchema.safeParse("0x1234567890abcdef1234567890abcdef12345678");
    expect(result.success).toBe(true);
  });

  it("rejects address without 0x prefix", () => {
    const result = AddressSchema.safeParse("1234567890abcdef1234567890abcdef12345678");
    expect(result.success).toBe(false);
  });

  it("rejects short address", () => {
    const result = AddressSchema.safeParse("0x1234");
    expect(result.success).toBe(false);
  });

  it("rejects non-hex characters", () => {
    const result = AddressSchema.safeParse("0xZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ");
    expect(result.success).toBe(false);
  });
});

describe("KongBatchWebhookSchema", () => {
  const validPayload = {
    abiPath: "yearn/3/vault",
    chainId: 747474,
    blockNumber: "12345",
    blockTime: "1700000000",
    subscription: {
      id: "S_KATANA_APR",
      url: "https://example.com/api/webhook",
      abiPath: "yearn/3/vault",
      type: "timeseries" as const,
      labels: ["katana-apr"],
    },
    vaults: ["0x1234567890abcdef1234567890abcdef12345678"],
  };

  it("accepts valid payload with string bigints", () => {
    const result = KongBatchWebhookSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.blockNumber).toBe(12345n);
      expect(result.data.blockTime).toBe(1700000000n);
    }
  });

  it("coerces number blockNumber to bigint", () => {
    const result = KongBatchWebhookSchema.safeParse({
      ...validPayload,
      blockNumber: 999,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.blockNumber).toBe(999n);
    }
  });

  it("rejects invalid vault address", () => {
    const result = KongBatchWebhookSchema.safeParse({
      ...validPayload,
      vaults: ["not-an-address"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing fields", () => {
    const result = KongBatchWebhookSchema.safeParse({
      chainId: 747474,
    });
    expect(result.success).toBe(false);
  });

  it("accepts empty vaults array", () => {
    const result = KongBatchWebhookSchema.safeParse({
      ...validPayload,
      vaults: [],
    });
    expect(result.success).toBe(true);
  });
});

describe("OutputSchema", () => {
  it("accepts valid output", () => {
    const result = OutputSchema.safeParse({
      chainId: 747474,
      address: "0x1234567890abcdef1234567890abcdef12345678",
      label: "katana-apr",
      component: "totalAPR",
      value: 0.05,
      blockNumber: 12345n,
      blockTime: 1700000000n,
    });
    expect(result.success).toBe(true);
  });
});
