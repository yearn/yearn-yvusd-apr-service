import { initObservability } from "./lib/observability";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    initObservability();
  }
}
