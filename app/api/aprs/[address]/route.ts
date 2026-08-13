import { captureError, flushObservability } from "@/lib/observability";
import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { readVaultAprs } from "@/lib/redis";

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
    const [result] = await readVaultAprs([address]);

    if (!result) {
      return NextResponse.json(
        { error: `Vault ${address} not found. Run sync first or check the address.` },
        { status: 404 },
      );
    }

    return NextResponse.json(result, {
      headers: { "Cache-Control": "s-maxage=900, stale-while-revalidate=60" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    captureError(error);
    await flushObservability();
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
