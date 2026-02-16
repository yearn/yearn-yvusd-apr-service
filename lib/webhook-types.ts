import { z } from "zod/v4";

export const AddressSchema = z.string().regex(
  /^0x[0-9a-fA-F]{40}$/,
  "Invalid address: must be 0x-prefixed 40-char hex string",
);

export type Address = z.infer<typeof AddressSchema>;

export const WebhookSubscriptionSchema = z.object({
  id: z.string(),
  url: z.string(),
  abiPath: z.string(),
  type: z.literal("timeseries"),
  labels: z.array(z.string()),
});

export type WebhookSubscription = z.infer<typeof WebhookSubscriptionSchema>;

export const KongBatchWebhookSchema = z.object({
  abiPath: z.string(),
  chainId: z.number(),
  blockNumber: z.coerce.bigint(),
  blockTime: z.coerce.bigint(),
  subscription: WebhookSubscriptionSchema,
  vaults: z.array(AddressSchema),
});

export type KongBatchWebhook = z.infer<typeof KongBatchWebhookSchema>;

export const OutputSchema = z.object({
  chainId: z.number(),
  address: AddressSchema,
  label: z.string(),
  component: z.string(),
  value: z.number(),
  blockNumber: z.bigint(),
  blockTime: z.bigint(),
});

export type Output = z.infer<typeof OutputSchema>;
