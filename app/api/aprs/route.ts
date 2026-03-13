import { NextResponse } from "next/server";
import { readAprResult, getSmoothedApr, enrichComponentsWithSmoothed } from "@/lib/redis";
import type { VaultAprResult } from "@/lib/models";

export async function GET() {
  try {
    const data = await readAprResult();
    if (!data) {
      return NextResponse.json(
        { error: "No APR data available. Run sync first." },
        { status: 404 },
      );
    }

    // Overwrite instant APR/APY with 24h smoothed values when available
    for (const [address, raw] of Object.entries(data)) {
      const vault = raw as VaultAprResult;
      vault.apr_raw = vault.apr;
      vault.apy_raw = vault.apy;
      const smoothed = await getSmoothedApr(address);
      if (smoothed && smoothed.samples > 1) {
        vault.apr = smoothed.apr;
        vault.apy = smoothed.apy;
      }
      await enrichComponentsWithSmoothed(address, vault.components);
    }

    return NextResponse.json(data, {
      headers: { "Cache-Control": "s-maxage=900, stale-while-revalidate=60" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
