import { aprToApy, unlockTimeToPeriodsPerYear } from "@/lib/apy";
import { getVaultProfitMaxUnlockTime, ONE } from "@/lib/onchain";
import { readVaultAprs } from "@/lib/redis";
import {
  findComponent,
  jsonResponseWithBigInt,
  type KongOutput,
  parseWebhookBody,
  verifyWebhookSignature,
} from "@/lib/webhook-utils";
import { NextRequest, NextResponse } from "next/server";
import { captureError, flushObservability } from "@/lib/observability";

const YVUSD_ADDRESS = "0x696d02Db93291651ED510704c9b286841d506987";
const LOCKED_YVUSD_ADDRESS = "0xAaaFEa48472f77563961Cdb53291DEDfB46F9040";

export async function OPTIONS() {
  return new Response("", {});
}

export async function POST(request: NextRequest) {
  const secret = process.env.KONG_WEBHOOK_SECRET;
  if (!secret) {
    const error = new Error("Webhook secret not configured");
    captureError(error);
    await flushObservability();
    return NextResponse.json(
      { error: error.message },
      { status: 500 },
    );
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
    const { addresses, blockNumber, blockTime, label } =
      parseWebhookBody(rawBody);
    const yvusd = (process.env.YVUSD_ADDRESS ?? YVUSD_ADDRESS).toLowerCase();
    const locked = (process.env.LOCKED_YVUSD_ADDRESS ?? LOCKED_YVUSD_ADDRESS).toLowerCase();

    const filteredAddresses = addresses.filter(
      (a) => a.toLowerCase() === yvusd || a.toLowerCase() === locked,
    );
    if (filteredAddresses.length === 0) {
      return NextResponse.json(
        { error: "No supported addresses provided" },
        { status: 400 },
      );
    }

    const requestedAddresses = new Set(filteredAddresses.map((address) => address.toLowerCase()));
    const aprResults = await readVaultAprs(filteredAddresses);
    const outputs: KongOutput[] = [];

    for (const vault of aprResults) {
      if (!vault) continue;
      if (!requestedAddresses.has(vault.address.toLowerCase())) continue;
      const base = {
        chainId: vault.chain_id,
        address: vault.address,
        label,
        blockNumber,
        blockTime,
      };

      const netAPR = findComponent(vault.components, "net_apr");
      const baseNetAPR = findComponent(vault.components, "base_net_apr");
      const lockerBonusAPR = findComponent(
        vault.components,
        "locker_bonus_apr",
      );
      const aprSource = netAPR ?? baseNetAPR;
      if (!aprSource && !lockerBonusAPR) continue;

      const netValue =
        netAPR?.apr ?? (baseNetAPR?.apr ?? 0) + (lockerBonusAPR?.apr ?? 0);
      const netApyValue =
        netAPR?.apy ?? (baseNetAPR?.apy ?? 0) + (lockerBonusAPR?.apy ?? 0);
      outputs.push({ ...base, component: "netAPR", value: netValue });
      outputs.push({ ...base, component: "netAPY", value: netApyValue });

      if (aprSource) {
        const grossRaw = aprSource.meta?.gross_apr_raw as string | undefined;
        if (grossRaw)
          outputs.push({
            ...base,
            component: "grossAPR",
            value: Number(BigInt(grossRaw)) / 1e18,
          });
      }

      if (baseNetAPR) {
        outputs.push({
          ...base,
          component: "baseNetAPR",
          value: baseNetAPR.apr,
        });
        outputs.push({
          ...base,
          component: "baseNetAPY",
          value: baseNetAPR.apy,
        });
      }
      if (lockerBonusAPR) {
        outputs.push({
          ...base,
          component: "lockerBonusAPR",
          value: lockerBonusAPR.apr,
        });
        outputs.push({
          ...base,
          component: "lockerBonusAPY",
          value: lockerBonusAPR.apy,
        });
      }

      // Per-strategy outputs (similar to v2-estimated-apr-hook)
      const strategies = vault.meta?.strategies as
        | Array<Record<string, unknown>>
        | undefined;
      if (strategies) {
        for (const strategy of strategies) {
          const stratAddress = strategy.address as string;
          if (!stratAddress) continue;

          const stratBase = { ...base, address: stratAddress };
          const netAprRaw = BigInt(String(strategy.net_apr_raw ?? "0"));
          const netApr = Number(netAprRaw) / Number(ONE);
          const weight = Number(strategy.weight ?? 0);

          const unlockTime = await getVaultProfitMaxUnlockTime(
            vault.address,
            vault.chain_id,
          );
          const netAPY = aprToApy(
            netApr,
            unlockTimeToPeriodsPerYear(Number(unlockTime)),
          );

          outputs.push({ ...stratBase, component: "netAPR", value: netApr });
          outputs.push({ ...stratBase, component: "netAPY", value: netAPY });
          outputs.push({ ...stratBase, component: "debtRatio", value: weight });
        }
      }
    }

    return jsonResponseWithBigInt(outputs);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Webhook error: ${message}`, { error });
    captureError(error);
    await flushObservability();
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
