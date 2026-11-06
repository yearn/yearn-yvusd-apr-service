import { describe, expect, test } from "bun:test";
import {
  ONE,
  RAY,
  SECONDS_PER_YEAR,
  annualizeGrowthRatio,
  lnImpliedRateToApyRaw,
  morphoVaultItemTotalApr,
  morphoVaultV2ItemTotalApr,
  ratePerSecondToApyRaw,
  rayAnnualRateToApyRaw,
} from "./onchain";

const toFloat = (raw: bigint | null) => Number(raw) / Number(ONE);

describe("rate sources return APR, not APY", () => {
  test("annualizeGrowthRatio is linear", () => {
    expect(toFloat(annualizeGrowthRatio(1.01, SECONDS_PER_YEAR / 12))).toBeCloseTo(0.12, 12);
    expect(toFloat(annualizeGrowthRatio(1 + 0.0605 / 52, SECONDS_PER_YEAR / 52))).toBeCloseTo(0.0605, 12);
  });

  test("rayAnnualRateToApyRaw does not compound", () => {
    expect(rayAnnualRateToApyRaw((RAY * 5n) / 100n)).toBe((ONE * 5n) / 100n);
  });

  test("ratePerSecondToApyRaw does not compound", () => {
    const rps = (ONE * 5n) / 100n / BigInt(SECONDS_PER_YEAR);
    expect(ratePerSecondToApyRaw(rps)).toBe(rps * BigInt(SECONDS_PER_YEAR));
  });

  test("lnImpliedRateToApyRaw returns the continuous rate", () => {
    expect(lnImpliedRateToApyRaw((ONE * 8n) / 100n)).toBe((ONE * 8n) / 100n);
  });

  test("morpho vault APY is converted to APR", () => {
    expect(morphoVaultItemTotalApr({ state: { avgNetApy: 0.0678 } } as never)).toBeCloseTo(0.06560, 5);
    expect(morphoVaultItemTotalApr({ state: { netApy: 0.0678 } } as never)).toBeCloseTo(0.06560, 5);
    expect(
      morphoVaultItemTotalApr({
        state: { avgNetApyExcludingRewards: 0.0678, allRewards: [{ supplyApr: 0.01 }] },
      } as never),
    ).toBeCloseTo(0.07560, 5);
    expect(morphoVaultV2ItemTotalApr({ avgNetApy: 0.0678 } as never)).toBeCloseTo(0.06560, 5);
  });
});
