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
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
