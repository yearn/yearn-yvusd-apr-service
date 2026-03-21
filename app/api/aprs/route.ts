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

    // Add smoothed APR/APY as separate fields, keeping instant values intact
    for (const [address, raw] of Object.entries(data)) {
      const vault = raw as VaultAprResult;
      const smoothed = await getSmoothedApr(address);
      if (smoothed && smoothed.samples > 1) {
        (vault as unknown as Record<string, unknown>).smoothed_apr = smoothed.apr;
        (vault as unknown as Record<string, unknown>).smoothed_apy = smoothed.apy;
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
