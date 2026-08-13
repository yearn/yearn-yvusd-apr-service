import { captureError, flushObservability } from "@/lib/observability";
import { NextResponse } from "next/server";
import { readCache } from "@/lib/redis";

export async function GET() {
  try {
    const data = await readCache();
    if (!data) {
      return NextResponse.json(
        { error: "No cached data available" },
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
