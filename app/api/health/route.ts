import { NextResponse } from "next/server";
import { readAprResult } from "@/lib/redis";

export async function GET() {
  const checks: Record<string, { status: string; detail?: string }> = {};
  let overall: "ok" | "degraded" | "error" = "ok";

  // Check Redis connectivity + data freshness
  try {
    const data = await readAprResult();
    if (data) {
      // Check freshness from any vault's computed_at
      const anyVault = Object.values(data)[0] as Record<string, unknown> | undefined;
      const computedAt = anyVault?.computed_at as string | undefined;
      if (computedAt) {
        const age = Date.now() - new Date(computedAt).getTime();
        const ageMinutes = Math.round(age / 60_000);
        const stale = age > 30 * 60_000; // >30 min = stale
        checks.data = {
          status: stale ? "stale" : "ok",
          detail: `Last computed ${ageMinutes}m ago`,
        };
        if (stale) overall = "degraded";
      } else {
        checks.data = { status: "ok", detail: "Data available (no timestamp)" };
      }
    } else {
      checks.data = { status: "empty", detail: "No APR data. Run /api/sync." };
      overall = "degraded";
    }
    checks.redis = { status: "ok" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    checks.redis = { status: "error", detail: message };
    checks.data = { status: "unknown" };
    overall = "error";
  }

  const statusCode = overall === "error" ? 503 : 200;
  return NextResponse.json(
    {
      status: overall,
      timestamp: new Date().toISOString(),
      checks,
    },
    { status: statusCode },
  );
}
