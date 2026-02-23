import { readAprResult } from "@/lib/redis";
import type { VaultAprResult } from "@/lib/models";
import { CopyButton } from "./copy-button";

export const dynamic = "force-dynamic";

export default async function Home() {
  let vaults: VaultAprResult[] = [];
  try {
    const data = await readAprResult();
    if (data) {
      vaults = Object.values(data) as VaultAprResult[];
    }
  } catch {}

  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000";

  return (
    <main className="max-w-3xl mx-auto px-6 py-16">
      <header className="mb-12">
        <h1 className="text-3xl font-semibold mb-2">yvUSD APR API</h1>
        <p className="text-zinc-400">
          Real-time APR data for Yearn{"'"}s yvUSD and LockedYvUSD vaults.
          Synced every 15 minutes.
        </p>
      </header>

      {vaults.length > 0 && (
        <section className="mb-10">
          <h2 className="text-xl font-semibold mb-4">Latest APRs</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left text-zinc-400">
                  <th className="pb-3 pr-4 font-medium whitespace-nowrap">Vault</th>
                  <th className="pb-3 pr-4 font-medium whitespace-nowrap">Chain</th>
                  <th className="pb-3 pr-4 font-medium text-right whitespace-nowrap">APR</th>
                  <th className="pb-3 pr-4 font-medium text-right whitespace-nowrap">APY</th>
                  <th className="pb-3 font-medium" style={{ width: "99%" }}>Components</th>
                </tr>
              </thead>
              <tbody>
                {vaults.map((v) => (
                  <tr key={v.address} className="border-b border-zinc-900">
                    <td className="py-3 pr-4">
                      <div className="font-medium">{v.name}</div>
                      <code className="text-xs text-zinc-500">
                        {v.address.slice(0, 6)}...{v.address.slice(-4)}
                      </code>
                    </td>
                    <td className="py-3 pr-4">
                      <code className="bg-zinc-900 rounded px-2 py-1 text-xs text-zinc-300">
                        {v.chain_id}
                      </code>
                    </td>
                    <td className="py-3 pr-4 text-right font-mono">
                      {(v.apr * 100).toFixed(2)}%
                    </td>
                    <td className="py-3 pr-4 text-right font-mono">
                      {v.apy != null ? `${(v.apy * 100).toFixed(2)}%` : "—"}
                    </td>
                    <td className="py-3">
                      <div className="flex flex-wrap gap-1">
                        {v.components.map((c, i) => (
                          <span
                            key={i}
                            className="bg-zinc-900 rounded px-2 py-0.5 text-xs text-zinc-400"
                          >
                            {c.label}{" "}
                            <span className="text-zinc-300">
                              {(c.apr * 100).toFixed(2)}%
                            </span>
                            {c.apy != null && (
                              <span className="text-zinc-500 ml-1">
                                ({(c.apy * 100).toFixed(2)}% APY)
                              </span>
                            )}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="mb-10">
        <h2 className="text-xl font-semibold mb-4">Endpoints</h2>
        <ul className="space-y-2">
          <li className="flex items-start gap-3">
            <code className="bg-zinc-900 rounded px-2 py-1 font-mono text-sm text-zinc-300 shrink-0">
              GET /api/aprs
            </code>
            <span className="text-zinc-500 text-sm">
              Precomputed APR results from cache
            </span>
          </li>
          <li className="flex items-start gap-3">
            <code className="bg-zinc-900 rounded px-2 py-1 font-mono text-sm text-zinc-300 shrink-0">
              GET /api/snapshot
            </code>
            <span className="text-zinc-500 text-sm">
              Raw strategy cache
            </span>
          </li>
          <li className="flex items-start gap-3">
            <code className="bg-zinc-900 rounded px-2 py-1 font-mono text-sm text-zinc-300 shrink-0">
              GET /api/health
            </code>
            <span className="text-zinc-500 text-sm">Health check</span>
          </li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold mb-4">Example</h2>
        <div className="relative">
          <pre className="bg-zinc-900 rounded-lg px-4 py-3 font-mono text-sm overflow-x-auto">
{`curl ${host}/api/aprs`}
          </pre>
          <CopyButton text={`curl ${host}/api/aprs`} />
        </div>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold mb-4">Example Response</h2>
        <pre className="bg-zinc-900 rounded-lg px-4 py-3 font-mono text-sm overflow-x-auto">
{`{
  "0x696d...": {
    "name": "yvUSD",
    "symbol": "yvUSD",
    "address": "0x696d...",
    "chain_id": 1,
    "apr": 0.045,
    "apy": 0.046,
    "components": [
      { "label": "net_apr", "apr": 0.045, "apy": 0.046, "source": "onchain" }
    ]
  }
}`}
        </pre>
      </section>

      <footer className="pt-8 border-t border-zinc-900">
        <a
          href="https://github.com/yearn/yearn-yvusd-apr-service"
          target="_blank"
          rel="noopener noreferrer"
          className="text-zinc-500 hover:text-zinc-300 text-sm transition-colors"
        >
          github.com/yearn/yearn-yvusd-apr-service
        </a>
      </footer>
    </main>
  );
}
