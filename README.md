# yvUSD APR API

REST API that computes real-time APR data for Yearn's yvUSD and LockedYvUSD vaults. Built on Next.js with viem for onchain reads and Redis for caching.

The API indexes vault strategies from onchain events, computes debt-weighted APRs per vault (including cross-chain, morpho looper, and historical strategies), applies fee schedules, and serves precomputed results.

## Setup

```
bun install
cp .env.local.example .env.local
```

Edit `.env.local` with your values:

```
ETH_RPC_URL=https://eth.llamarpc.com
ARB_RPC_URL=https://arb1.arbitrum.io/rpc
BASE_RPC_URL=https://mainnet.base.org
KAT_RPC_URL=
REDIS_URL=redis://localhost:6379
HYPERSYNC_API_TOKEN=
```

A running Redis instance is required. To run redis on localhost, try docker like this

```
docker run --rm -p 6379:6379 redis:latest
```

### `CRON_SECRET`

Vercel cron jobs call `GET /api/sync` every 15 minutes. The endpoint requires `CRON_SECRET` to authenticate these requests. Vercel sends it automatically as an `Authorization: Bearer <secret>` header.

Store `CRON_SECRET` in both Doppler configs (`prd` and `preview`) so the Vercel integration keeps it in the project env store after a sync. Vercel cron signs requests from that store; do not leave it only as an unmanaged Vercel variable.

All other runtime secrets (RPC URLs, Redis, Hypersync, Kong, OTEL, addresses) also live in Doppler `prd`/`preview`. The deploy workflow no longer inlines them from 1Password.

Generate a secret (at least 16 random characters):

```
openssl rand -base64 32
```

Add it in Doppler `prd` and `preview` (the Vercel integration copies it into the project env store):

```
doppler secrets set CRON_SECRET --project yvusd-apr-service --config prd
doppler secrets set CRON_SECRET --project yvusd-apr-service --config preview
```

In production, if `CRON_SECRET` is unset the route returns `500` (fail closed). In local dev (`NODE_ENV !== "production"`), the auth check is skipped so you can call the endpoint freely.

## Running

```
bun dev          # development (turbopack)
bun run build    # production build
bun start        # production server
```

## API

### `GET /api/health`

Health check. Verifies Redis connectivity and data freshness.

Returns `200` when healthy or degraded, `503` when Redis is unreachable.

```json
{
  "status": "ok",
  "timestamp": "2026-02-13T12:00:00.000Z",
  "checks": {
    "redis": { "status": "ok" },
    "data": { "status": "ok", "detail": "Last computed 5m ago" }
  }
}
```

Possible `status` values: `ok`, `degraded` (stale data or empty), `error` (Redis down).

### `GET /api/sync`

Triggers a full sync cycle: indexes strategy events from the chain, hydrates onchain metadata, computes APRs for all configured vaults, and writes results to Redis. Called automatically by Vercel cron every 15 minutes.

Requires `Authorization: Bearer <CRON_SECRET>` (Vercel cron sends this automatically). Production fails closed with `500` if `CRON_SECRET` is unset; local dev skips auth when it is absent. See [CRON_SECRET](#cron_secret).

**Response**

```json
{
  "ok": true,
  "vaults": {
    "1:0x696d...": { "strategies": 5, "last_block": 24350000 }
  },
  "apr": {
    "0x696d...": {
      "name": "yvUSD",
      "symbol": "yvUSD",
      "address": "0x696d...",
      "chain_id": 1,
      "apr": 0.045,
      "components": [
        {
          "label": "net_apr",
          "apr": 0.045,
          "source": "onchain",
          "meta": { "strategy_id": "base_yvusd", "..." : "..." }
        }
      ],
      "meta": { "asset": "0x...", "strategies": [ "..." ] }
    }
  }
}
```

### `GET /api/aprs`

Returns precomputed APR results for all vaults from Redis. No onchain calls — instant response.

Returns `404` if sync has not been run yet.

**Response**

```json
{
  "0x696d...": {
    "name": "yvUSD",
    "symbol": "yvUSD",
    "address": "0x696d...",
    "chain_id": 1,
    "apr": 0.045,
    "components": [ "..." ],
    "meta": { "..." : "..." }
  },
  "0xAaaF...": {
    "name": "LockedYvUSD",
    "symbol": "LockedYvUSD",
    "address": "0xAaaF...",
    "chain_id": 1,
    "apr": 0.062,
    "components": [
      { "label": "base_net_apr", "apr": 0.045, "source": "onchain" },
      { "label": "locker_bonus_apr", "apr": 0.017, "source": "onchain" }
    ],
    "meta": { "cooldownDuration": 864000, "withdrawWindow": 172800 }
  }
}
```

### `GET /api/aprs/<address>`

Returns APR data for a single vault by contract address. Case-insensitive.

Returns `400` for invalid addresses, `404` if the vault is not found.

**Response**

```json
{
  "name": "yvUSD",
  "symbol": "yvUSD",
  "address": "0x696d...",
  "chain_id": 1,
  "apr": 0.045,
  "apy": 0.046,
  "components": [
    { "label": "net_apr", "apr": 0.045, "apy": 0.046, "source": "onchain" }
  ],
  "computed_at": "2026-02-13T12:00:00.000Z"
}
```

### `GET /api/snapshot`

Returns the raw strategy cache from Redis (indexed strategy metadata, not APRs).

## Architecture

### Sync flow (`GET /api/sync`)

```
                          GET /api/sync
                                │
                    ┌───────────┴───────────┐
                    │  Load config.yaml     │
                    │  Init viem clients    │
                    └───────────┬───────────┘
                                │
              ┌─────────────────┴─────────────────┐
              │  Phase 1: Strategy Sync            │
              │                                    │
              │  For each vault:                   │
              │    HyperSync ──► StrategyChanged   │
              │    events (or RPC fallback)         │
              │           │                        │
              │    Apply events to cache            │
              │    Hydrate onchain metadata         │
              │    Apply config overrides           │
              │           │                        │
              │  Discover collateral vaults         │
              │  from morpho-looper strategies      │
              │  and sync those too                 │
              │           │                        │
              │    Write ──► Redis                  │
              │    (yvusd:strategy_cache)           │
              └─────────────────┬─────────────────┘
                                │
              ┌─────────────────┴─────────────────┐
              │  Phase 2: APR Computation          │
              │                                    │
              │  Create YvUsdAprEngine             │
              │           │                        │
              │  For each vault + strategy:        │
              │    ┌──────┴──────┐                 │
              │    │  multicall  │ ◄── 1 RPC call  │
              │    │  batch:     │     per vault    │
              │    │  totalAssets│                  │
              │    │  totalSupply│                  │
              │    │  N debts   │                  │
              │    │  N oracle  │                  │
              │    │  APRs      │                  │
              │    │  feeConfig │                  │
              │    └──────┬──────┘                 │
              │           │                        │
              │  Offchain strategies resolve       │
              │  individually:                     │
              │    • static (hardcoded)            │
              │    • historical (share price)      │
              │    • morpho-looper (collateral     │
              │      APR × leverage - borrow APY)  │
              │    • cross-chain (remote oracle)   │
              │           │                        │
              │  Debt-weight APRs, apply fees      │
              │  Sum components per vault           │
              │           │                        │
              │    Write ──► Redis                  │
              │    (yvusd:apr_result)               │
              └─────────────────┬─────────────────┘
                                │
                         Return JSON response
                    (vaults summary + apr results)
```

### APR read flow (`GET /api/aprs`)

```
        GET /api/aprs
              │
     Redis GET yvusd:apr_result
              │
        ┌─────┴─────┐
        │ found?    │
        ├─ yes ──► 200 JSON (precomputed APRs)
        └─ no  ──► 404
```

## Project structure

```
├── app/
│   └── api/
│       ├── health/route.ts        GET  /api/health
│       ├── sync/route.ts           GET  /api/sync
│       ├── aprs/route.ts          GET  /api/aprs
│       ├── aprs/[address]/route.ts GET  /api/aprs/<address>
│       └── snapshot/route.ts      GET  /api/snapshot
├── lib/
│   ├── onchain.ts           viem clients, ABIs, multicall, contract reads
│   ├── hypersync.ts         HyperSync event fetching (+ RPC fallback)
│   ├── strategy-store.ts    strategy indexing, config overrides
│   ├── apr-engine.ts        YvUsdAprEngine — core APR math (bigint)
│   ├── calculators.ts       yvusd_base / locked_yvusd calculators
│   ├── apr-service.ts       orchestrator — computeAllVaultsApr()
│   ├── redis.ts             ioredis client, cache + APR result keys
│   ├── models.ts            AprComponent, VaultAprResult interfaces
│   └── config.ts            YAML config loader, type definitions
└── config/
    └── config.yaml          vault, strategy, and source configuration
```
