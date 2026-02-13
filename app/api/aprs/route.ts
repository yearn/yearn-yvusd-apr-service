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
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
