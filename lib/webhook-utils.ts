import type { AprComponent } from "@/lib/models";
import { createHmac, timingSafeEqual } from "crypto";

export interface KongOutput {
  chainId: number;
  address: string;
  label: string;
  component: string;
  value: number;
  blockNumber: bigint;
  blockTime: bigint;
}

export interface ParsedWebhookBody {
  addresses: string[];
  blockNumber: bigint;
  blockTime: bigint;
  label: string;
}

export function verifyWebhookSignature(
  signatureHeader: string,
  body: string,
  secret: string,
  toleranceSeconds = 300,
): boolean {
  try {
    const parts = signatureHeader.split(",");
    const timestampPart = parts.find((p) => p.startsWith("t="));
    const signaturePart = parts.find((p) => p.startsWith("v1="));
    if (!timestampPart || !signaturePart) return false;

    const timestamp = parseInt(timestampPart.split("=")[1]);
    const receivedSignature = signaturePart.split("=")[1];

    const currentTime = Math.floor(Date.now() / 1000);
    if (Math.abs(currentTime - timestamp) > toleranceSeconds) {
      return false;
    }

    const expectedSignature = createHmac("sha256", secret)
      .update(`${timestamp}.${body}`, "utf8")
      .digest("hex");

    return timingSafeEqual(
      new Uint8Array(Buffer.from(receivedSignature, "hex")),
      new Uint8Array(Buffer.from(expectedSignature, "hex")),
    );
  } catch {
    return false;
  }
}

export function parseWebhookBody(rawBody: string): ParsedWebhookBody {
  const body = JSON.parse(rawBody);
  const { vaults, blockNumber, blockTime, subscription } = body;
  return {
    addresses: vaults as string[],
    blockNumber: BigInt(blockNumber),
    blockTime: BigInt(blockTime),
    label: subscription?.labels?.[0] ?? "",
  };
}


export function findComponent(components: AprComponent[], label: string): AprComponent | undefined {
  return components.find((c) => c.label === label);
}

export function jsonResponseWithBigInt(data: unknown): Response {
  const replacer = (_: string, v: unknown) => typeof v === "bigint" ? v.toString() : v;
  return new Response(JSON.stringify(data, replacer), {
    headers: { "Content-Type": "application/json" },
  });
}
