import { captureError, flushObservability } from "@/lib/observability";
import { NextResponse } from "next/server";
import { readAprResult } from "@/lib/redis";

export async function GET() {
  try {
    const data = await readAprResult();
    if (!data) {
      return NextResponse.json(
        { error: "No APR data available. Run sync first." },
        { status: 404 },
      );
    }

    return NextResponse.json(data, {
      headers: { "Cache-Control": "s-maxage=900, stale-while-revalidate=60" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    captureError(error);
    await flushObservability();
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
