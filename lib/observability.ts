import * as Sentry from "@sentry/node";

export function initObservability(): void {
  if (!process.env.SENTRY_DSN || Sentry.isInitialized()) return;
  Sentry.init({ dsn: process.env.SENTRY_DSN });
}

export function captureError(error: unknown): void {
  initObservability();
  console.error(error);
  Sentry.captureException(error);
}

export async function flushObservability(): Promise<void> {
  await Sentry.flush(2_000);
}
