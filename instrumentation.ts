import { captureError, flushObservability, initObservability } from "./lib/observability";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    initObservability();
  }
}

export async function onRequestError(error: unknown) {
  captureError(error);
  await flushObservability();
}
