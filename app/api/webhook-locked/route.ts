import type { VaultAprResult } from "@/lib/models";
import { readVaultAprs } from "@/lib/redis";
import {
  type KongOutput,
  verifyWebhookSignature,
  parseWebhookBody,
  jsonResponseWithBigInt,
  grossAprFromRaw,
  findComponent,
} from "@/lib/webhook-utils";
import { NextRequest, NextResponse } from "next/server";

const LOCKED_YVUSD_ADDRESS = process.env.LOCKED_YVUSD_ADDRESS ?? "";

function buildLockedOutputs(
  vault: VaultAprResult,
  label: string,
  blockNumber: bigint,
  blockTime: bigint,
): KongOutput[] {
  if (vault.address.toLowerCase() !== LOCKED_YVUSD_ADDRESS.toLowerCase()) return [];
  const base = { chainId: vault.chain_id, address: vault.address, label, blockNumber, blockTime };

  const outputs: KongOutput[] = [];

  const baseNetApr = findComponent(vault.components, "base_net_apr");
  const bonusApr = findComponent(vault.components, "locker_bonus_apr");

  const netAprValue = (baseNetApr?.apr ?? 0) + (bonusApr?.apr ?? 0);
  outputs.push({ ...base, component: "netAPR", value: netAprValue });

  if (baseNetApr) {
    outputs.push({ ...base, component: "baseNetAPR", value: baseNetApr.apr });
    const grossRaw = baseNetApr.meta?.gross_apr_raw as string | undefined;
    if (grossRaw) {
      outputs.push({ ...base, component: "grossAPR", value: grossAprFromRaw(grossRaw) });
    }
  }
  if (bonusApr) {
    outputs.push({ ...base, component: "lockerBonusAPR", value: bonusApr.apr });
  }

  return outputs;
}

export async function OPTIONS() {
  return new Response("", {});
}

export async function POST(request: NextRequest) {
  const secret = process.env.KONG_WEBHOOK_SECRET_LOCKED;
  if (!secret) {
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  const signature = request.headers.get("Kong-Signature");
  if (!signature) {
    return new Response("Missing signature", { status: 401 });
  }

  const rawBody = await request.text();

  if (!verifyWebhookSignature(signature, rawBody, secret)) {
    return new Response("Invalid signature", { status: 401 });
  }

  try {
    const { addresses, blockNumber, blockTime, label } = parseWebhookBody(rawBody);
    const aprResults = await readVaultAprs(addresses);
    const outputs: KongOutput[] = [];

    for (let i = 0; i < addresses.length; i++) {
      const vault = aprResults[i];
      if (!vault) continue;
      outputs.push(...buildLockedOutputs(vault, label, blockNumber, blockTime));
    }

    return jsonResponseWithBigInt(outputs);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Webhook-locked error: ${message}`, { error });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
