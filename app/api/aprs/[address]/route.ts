import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { readVaultAprs, getSmoothedApr, enrichComponentsWithSmoothed } from "@/lib/redis";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address } = await params;

  if (!isAddress(address)) {
    return NextResponse.json(
      { error: "Invalid Ethereum address format" },
      { status: 400 },
    );
  }

  try {
    // readVaultAprs lowercases internally, so case-insensitive lookup works
    const [result] = await readVaultAprs([address]);

    if (!result) {
      return NextResponse.json(
        { error: `Vault ${address} not found. Run sync first or check the address.` },
        { status: 404 },
      );
    }

    const smoothed = await getSmoothedApr(address);
    if (smoothed && smoothed.samples > 1) {
      result.smoothed_apr = smoothed.apr;
      result.smoothed_apy = smoothed.apy;
      result.smoothed_samples = smoothed.samples;
    }
    await enrichComponentsWithSmoothed(address, result.components);

    return NextResponse.json(result, {
      headers: { "Cache-Control": "s-maxage=900, stale-while-revalidate=60" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
