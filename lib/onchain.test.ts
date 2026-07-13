// @ts-ignore -- Bun provides its test module at runtime without a package dependency.
import { describe, expect, it } from "bun:test";
import { katanaVaultTotalApr, type KatanaVaultSnapshot } from "./onchain";

function snapshot(performance: NonNullable<KatanaVaultSnapshot["performance"]>): KatanaVaultSnapshot {
  return { performance };
}

type KatanaOracle = NonNullable<NonNullable<KatanaVaultSnapshot["performance"]>["oracle"]>;

describe("katanaVaultTotalApr", () => {
  it("matches the Yearn UI headline rate for a known Kong snapshot", () => {
    const result = katanaVaultTotalApr(snapshot({
      oracle: {
        apr: 0.013807584325964576,
        apy: 0.013901490947987538,
        netAPR: 0.010176825893368118,
        netAPY: 0.010227780000433562,
      },
      estimated: {
        apr: 0.01792828151237045,
        apy: 0.018086812109868067,
        components: {
          katanaAppRewardsAPR: 0.028002989898831085,
          fixedRateKatanaRewards: 0,
        },
      },
    }));

    expect(result).toBeCloseTo(0.04608980200869915, 12);
  });

  it("prefers estimated APY and adds app and fixed-rate rewards", () => {
    const result = katanaVaultTotalApr(snapshot({
      oracle: { apr: 0.06, apy: 0.05, netAPR: 0.04, netAPY: 0.03 },
      estimated: {
        apr: 0.049,
        apy: 0.051,
        components: {
          katanaAppRewardsAPR: 0.02,
          fixedRateKatanaRewards: 0.003,
        },
      },
    }));

    expect(result).toBeCloseTo(0.074, 12);
  });

  it("falls back from a non-finite estimated APY to estimated APR", () => {
    const result = katanaVaultTotalApr(snapshot({
      oracle: { netAPY: 0.04 },
      estimated: {
        apr: 0.05,
        apy: Number.NaN,
        components: { katanaAppRewardsAPR: 0.023 },
      },
    }));

    expect(result).toBeCloseTo(0.073, 12);
  });

  const oracleFallbacks: Array<[KatanaOracle, number]> = [
    [{ netAPY: 0.04, apy: 0.05, netAPR: 0.06, apr: 0.07 }, 0.04],
    [{ apy: 0.05, netAPR: 0.06, apr: 0.07 }, 0.05],
    [{ netAPR: 0.06, apr: 0.07 }, 0.06],
    [{ apr: 0.07 }, 0.07],
  ];

  it.each(oracleFallbacks)("uses the oracle fallback order", (oracle: KatanaOracle, expected: number) => {
    expect(katanaVaultTotalApr(snapshot({ oracle }))).toBeCloseTo(expected, 12);
  });

  it("uses historical net yield after estimated and oracle values", () => {
    const result = katanaVaultTotalApr(snapshot({
      estimated: { components: { katanaAppRewardsAPR: 0.02 } },
      historical: { net: 0.03 },
    }));

    expect(result).toBeCloseTo(0.05, 12);
  });

  it("treats zero estimated APY as authoritative", () => {
    const result = katanaVaultTotalApr(snapshot({
      oracle: { netAPY: 0.04 },
      estimated: {
        apr: 0.05,
        apy: 0,
        components: { katanaAppRewardsAPR: 0.023 },
      },
    }));

    expect(result).toBeCloseTo(0.023, 12);
  });

  it("preserves rewards-only snapshots", () => {
    const result = katanaVaultTotalApr(snapshot({
      estimated: {
        components: {
          katanaAppRewardsAPR: 0.02,
          fixedRateKatanaRewards: 0.003,
        },
      },
    }));

    expect(result).toBeCloseTo(0.023, 12);
  });

  it("returns null when no finite rate is available", () => {
    expect(katanaVaultTotalApr(snapshot({
      oracle: { netAPR: Number.POSITIVE_INFINITY },
      estimated: { apy: Number.NaN },
    }))).toBeNull();
  });
});
