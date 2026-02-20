import { readVaultAprs } from "@/lib/redis";
import {
  findComponent,

  jsonResponseWithBigInt,
  type KongOutput,
  parseWebhookBody,
  verifyWebhookSignature,
} from "@/lib/webhook-utils";
import { NextRequest, NextResponse } from "next/server";

const YVUSD_ADDRESS = process.env.YVUSD_ADDRESS ?? "";
const LOCKED_YVUSD_ADDRESS = process.env.LOCKED_YVUSD_ADDRESS ?? "";


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

  if (!verifyWebhookSignature(signature, rawBody, secret)) {
    return new Response("Invalid signature", { status: 401 });
  }

  try {
    const { addresses, blockNumber, blockTime, label } = parseWebhookBody(rawBody);
    const yvusd = YVUSD_ADDRESS.toLowerCase();
    const locked = LOCKED_YVUSD_ADDRESS.toLowerCase();

    const filteredAddresses = addresses.filter((a) => a.toLowerCase() === yvusd || a.toLowerCase() === locked);
    if (filteredAddresses.length === 0) {
      return NextResponse.json({ error: "No supported addresses provided" }, { status: 400 });
    }
    
    const aprResults = await readVaultAprs(filteredAddresses);
    const outputs: KongOutput[] = [];

    for (const vault of aprResults) {
      if (!vault) continue;
      const base = { chainId: vault.chain_id, address: vault.address, label, blockNumber, blockTime };

      const netApr = findComponent(vault.components, "net_apr");
      const baseNetApr = findComponent(vault.components, "base_net_apr");
      const bonusApr = findComponent(vault.components, "locker_bonus_apr");
      const aprSource = netApr ?? baseNetApr;
      if (!aprSource && !bonusApr) continue;

      const netValue = netApr?.apr ?? ((baseNetApr?.apr ?? 0) + (bonusApr?.apr ?? 0));
      outputs.push({ ...base, component: "netAPR", value: netValue });

      if (aprSource) {
        const grossRaw = aprSource.meta?.gross_apr_raw as string | undefined;
        if (grossRaw) outputs.push({ ...base, component: "grossAPR", value: Number(BigInt(grossRaw)) / 1e18 });
      }
      if (baseNetApr) outputs.push({ ...base, component: "baseNetAPR", value: baseNetApr.apr });
      if (bonusApr) outputs.push({ ...base, component: "lockerBonusAPR", value: bonusApr.apr });
    }

    return jsonResponseWithBigInt(outputs);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Webhook error: ${message}`, { error });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
