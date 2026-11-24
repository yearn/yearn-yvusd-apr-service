import { expect, test } from "bun:test";
import { loadServiceConfig } from "./config";

test("loadServiceConfig reads the build-time inlined YAML before the filesystem", () => {
  process.env.SERVICE_CONFIG_YAML = "apr:\n  vaults: []\n";
  try {
    expect(loadServiceConfig().apr.vaults).toEqual([]);
  } finally {
    delete process.env.SERVICE_CONFIG_YAML;
  }
});
