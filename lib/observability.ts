import { logs, SeverityNumber } from "@opentelemetry/api-logs";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchLogRecordProcessor, LoggerProvider } from "@opentelemetry/sdk-logs";
import {
  ATTR_EXCEPTION_MESSAGE,
  ATTR_EXCEPTION_STACKTRACE,
  ATTR_EXCEPTION_TYPE,
  ATTR_SERVICE_NAME,
} from "@opentelemetry/semantic-conventions";

const SERVICE_NAME = "yvusd-apr-service";
const PROVIDER_KEY = Symbol.for("yearn.yvusd-apr-service.otel.logger-provider");
const EXPORT_TIMEOUT_MS = 2_000;

type OtelGlobal = typeof globalThis & { [PROVIDER_KEY]?: LoggerProvider };

function getProvider(): LoggerProvider | undefined {
  return (globalThis as OtelGlobal)[PROVIDER_KEY];
}

function serviceName(): string {
  return process.env.OTEL_SERVICE_NAME || SERVICE_NAME;
}

// Reporting is a no-op until an OTLP endpoint is configured via the standard
// OTEL_EXPORTER_OTLP_* env vars. Point it at any OTLP-compatible backend.
export function initObservability(): void {
  if (
    getProvider() ||
    !(process.env.OTEL_EXPORTER_OTLP_ENDPOINT || process.env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT)
  ) {
    return;
  }

  const provider = new LoggerProvider({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: serviceName(),
    }),
    processors: [
      new BatchLogRecordProcessor(new OTLPLogExporter({ timeoutMillis: EXPORT_TIMEOUT_MS })),
    ],
  });
  (globalThis as OtelGlobal)[PROVIDER_KEY] = provider;
  logs.setGlobalLoggerProvider(provider);
}

export function captureError(error: unknown): void {
  // Keep reporting available even if Next's instrumentation hook was not run
  // before a route handler (for example in a test or an alternate runtime).
  initObservability();
  const provider = getProvider();

  const err = error instanceof Error ? error : new Error(String(error));
  console.error(err);
  if (!provider) return;

  const attributes: Record<string, string> = {
    [ATTR_EXCEPTION_TYPE]: err.name,
    [ATTR_EXCEPTION_MESSAGE]: err.message,
  };
  if (err.stack) {
    attributes[ATTR_EXCEPTION_STACKTRACE] = err.stack;
  }

  provider.getLogger(serviceName()).emit({
    severityNumber: SeverityNumber.ERROR,
    severityText: "ERROR",
    body: err.message,
    attributes,
  });
}

// Serverless runtimes may freeze before batched logs export; flush after capture.
export async function flushObservability(): Promise<void> {
  try {
    await getProvider()?.forceFlush();
  } catch (error) {
    // Export failures must not mask the error the route is trying to return.
    console.error("OpenTelemetry log export failed", error);
  }
}
