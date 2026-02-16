import type { KongBatchWebhook, Output } from "./webhook-types";
import type { VaultAprResult } from "./models";
import { computeAllVaultsApr } from "./apr-service";
import { loadServiceConfig } from "./config";

export async function computeKatanaAPR(
  hook: KongBatchWebhook,
): Promise<Output[]> {
  const config = loadServiceConfig();
  const aprConfig = config.apr;

  const allResults = await computeAllVaultsApr(aprConfig);

  const outputs: Output[] = [];

  const results = await Promise.allSettled(
    hook.vaults.map(async (vaultAddress) => {
      const key = Object.keys(allResults).find(
        (k) => k.toLowerCase() === vaultAddress.toLowerCase(),
      );
      if (!key) return [];

      const vaultResult = allResults[key];
      return buildOutputsForVault(vaultResult, hook);
    }),
  );

  for (const result of results) {
    if (result.status === "fulfilled") {
      outputs.push(...result.value);
    } else {
      console.error("Failed to compute APR for vault:", result.reason);
    }
  }

  return outputs;
}

function buildOutputsForVault(
  vault: VaultAprResult,
  hook: KongBatchWebhook,
): Output[] {
  const outputs: Output[] = [];
  const base = {
    chainId: hook.chainId,
    address: vault.address as `0x${string}`,
    label: "katana-apr",
    blockNumber: hook.blockNumber,
    blockTime: hook.blockTime,
  };

  for (const component of vault.components) {
    outputs.push({
      ...base,
      component: component.label,
      value: component.apr,
    });
  }

  outputs.push({
    ...base,
    component: "totalAPR",
    value: vault.apr,
  });

  return outputs;
}
