import { createHmac, timingSafeEqual } from "crypto";

export function verifyWebhookSignature(
  signature: string,
  body: string,
  secret: string,
): boolean {
  const parts = signature.split(",");
  let timestamp = "";
  let v1 = "";

  for (const part of parts) {
    const eqIndex = part.indexOf("=");
    if (eqIndex === -1) continue;
    const key = part.slice(0, eqIndex);
    const value = part.slice(eqIndex + 1);
    if (key === "t") timestamp = value;
    if (key === "v1") v1 = value;
  }

  if (!timestamp || !v1) return false;

  const payload = `${timestamp}.${body}`;
  const expected = createHmac("sha256", secret)
    .update(payload)
    .digest("hex");

  if (expected.length !== v1.length) return false;

  return timingSafeEqual(Buffer.from(expected), Buffer.from(v1));
}

export function getWebhookSecret(subscriptionId: string): string | undefined {
  return process.env[`WEBHOOK_SECRET_${subscriptionId}`];
}
