import { describe, it, expect } from "vitest";
import { createHmac } from "crypto";
import { verifyWebhookSignature } from "./webhook-auth";

function createValidSignature(body: string, secret: string, timestamp?: string): string {
  const ts = timestamp ?? String(Math.floor(Date.now() / 1000));
  const payload = `${ts}.${body}`;
  const hmac = createHmac("sha256", secret).update(payload).digest("hex");
  return `t=${ts},v1=${hmac}`;
}

describe("verifyWebhookSignature", () => {
  const secret = "test-secret-key";
  const body = '{"chainId":747474,"vaults":["0x1234"]}';

  it("returns true for valid signature", () => {
    const signature = createValidSignature(body, secret);
    expect(verifyWebhookSignature(signature, body, secret)).toBe(true);
  });

  it("returns false for wrong secret", () => {
    const signature = createValidSignature(body, "wrong-secret");
    expect(verifyWebhookSignature(signature, body, secret)).toBe(false);
  });

  it("returns false for tampered body", () => {
    const signature = createValidSignature(body, secret);
    expect(verifyWebhookSignature(signature, body + "x", secret)).toBe(false);
  });

  it("returns false for missing timestamp", () => {
    expect(verifyWebhookSignature("v1=abc123", body, secret)).toBe(false);
  });

  it("returns false for missing v1", () => {
    expect(verifyWebhookSignature("t=12345", body, secret)).toBe(false);
  });

  it("returns false for empty signature", () => {
    expect(verifyWebhookSignature("", body, secret)).toBe(false);
  });

  it("uses timestamp in HMAC computation", () => {
    const ts = "1700000000";
    const signature = createValidSignature(body, secret, ts);
    expect(verifyWebhookSignature(signature, body, secret)).toBe(true);

    const wrongTs = signature.replace(`t=${ts}`, "t=9999999999");
    expect(verifyWebhookSignature(wrongTs, body, secret)).toBe(false);
  });
});
