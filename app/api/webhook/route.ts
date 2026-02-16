import type { AprComponent, VaultAprResult } from "@/lib/models";
import { readVaultAprs } from "@/lib/redis";
import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";

const YVUSD_ADDRESS = process.env.YVUSD_ADDRESS ?? "";
const LOCKED_YVUSD_ADDRESS = process.env.LOCKED_YVUSD_ADDRESS ?? "";

interface KongOutput {
  chainId: number;
  address: string;
  label: string;
  component: string;
  value: number;
  blockNumber: bigint;
  blockTime: bigint;
}

function verifySignature(
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

function grossAprFromRaw(raw: string): number {
  return Number(BigInt(raw)) / 1e18;
}

function findComponent(components: AprComponent[], label: string): AprComponent | undefined {
  return components.find((c) => c.label === label);
}

function buildOutputs(
  vault: VaultAprResult,
  label: string,
  blockNumber: bigint,
  blockTime: bigint,
): KongOutput[] {
  const base = { chainId: vault.chain_id, address: vault.address, label, blockNumber, blockTime };

  if (vault.address.toLowerCase() === YVUSD_ADDRESS.toLowerCase()) {
    const netApr = findComponent(vault.components, "net_apr");
    if (!netApr) return [];
    const outputs: KongOutput[] = [
      { ...base, component: "netAPR", value: netApr.apr },
    ];
    const grossRaw = netApr.meta?.gross_apr_raw as string | undefined;
    if (grossRaw) {
      outputs.push({ ...base, component: "grossAPR", value: grossAprFromRaw(grossRaw) });
    }
    return outputs;
  }

  if (vault.address.toLowerCase() === LOCKED_YVUSD_ADDRESS.toLowerCase()) {
    const outputs: KongOutput[] = [];
    const baseNetApr = findComponent(vault.components, "base_net_apr");
    if (baseNetApr) {
      outputs.push({ ...base, component: "baseNetAPR", value: baseNetApr.apr });
      const grossRaw = baseNetApr.meta?.gross_apr_raw as string | undefined;
      if (grossRaw) {
        outputs.push({ ...base, component: "grossAPR", value: grossAprFromRaw(grossRaw) });
      }
    }
    const bonusApr = findComponent(vault.components, "locker_bonus_apr");
    if (bonusApr) {
      outputs.push({ ...base, component: "lockerBonusAPR", value: bonusApr.apr });
    }
    return outputs;
  }

  return [];
}

export async function OPTIONS() {
  return new Response("", {});
}

export async function POST(request: NextRequest) {
  const secret = process.env.KONG_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  const signature = request.headers.get("Kong-Signature");
  if (!signature) {
    return new Response("Missing signature", { status: 401 });
  }

  const rawBody = await request.text();

  if (!verifySignature(signature, rawBody, secret)) {
    return new Response("Invalid signature", { status: 401 });
  }

  try {
    const body = JSON.parse(rawBody);
    const { vaults, blockNumber, blockTime, subscription } = body;

    const addresses = vaults as string[];
    const bn = BigInt(blockNumber);
    const bt = BigInt(blockTime);
    const aprResults = await readVaultAprs(addresses);
    const label = subscription?.labels?.[0] ?? "";
    const outputs: KongOutput[] = [];

    for (let i = 0; i < addresses.length; i++) {
      const vault = aprResults[i];
      if (!vault) continue;
      outputs.push(...buildOutputs(vault, label, bn, bt));
    }

    const replacer = (_: string, v: unknown) => typeof v === "bigint" ? v.toString() : v;
    return new Response(JSON.stringify(outputs, replacer), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Webhook error: ${message}`, { error });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
