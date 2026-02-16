import { NextRequest, NextResponse } from "next/server";
import { KongBatchWebhookSchema } from "@/lib/webhook-types";
import { verifyWebhookSignature, getWebhookSecret } from "@/lib/webhook-auth";
import { computeKatanaAPR } from "@/lib/webhook-output";

export const maxDuration = 120;

function bigintReplacer(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") {
    return value.toString();
  }
  return value;
}

export async function POST(request: NextRequest) {
  try {
    const signature = request.headers.get("Kong-Signature");
    const rawBody = await request.text();

    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const parsed = KongBatchWebhookSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", details: parsed.error.issues },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const hook = parsed.data;

    const secret = getWebhookSecret(hook.subscription.id);
    if (!secret || !signature || !verifyWebhookSignature(signature, rawBody, secret)) {
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }

    const outputs = await computeKatanaAPR(hook);

    return new NextResponse(JSON.stringify(outputs, bigintReplacer), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Webhook handler error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: message },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
