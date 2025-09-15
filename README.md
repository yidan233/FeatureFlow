# FeatureFlow

A **feature flag** and **canary release** platform built with **Node.js**, **TypeScript**, **PostgreSQL**, and **Redis**.

Safely roll out features, run A/B tests, and flip kill switches instantly — without redeploying code.

---

## Table of Contents

* [What is FeatureFlow?](#what-is-FeatureFlow)
* [Why Use It](#why-use-it)
* [Architecture](#architecture)
* [How It Works (End‑to‑End Flow)](#how-it-works-endtoend-flow)
* [Prerequisites](#prerequisites)
* [Quick Start](#quick-start)
* [Services & Ports](#services--ports)
* [Environment Variables](#environment-variables)
* [API Examples](#api-examples)
* [SDK Usage](#sdk-usage)
* [Monitoring & Metrics](#monitoring--metrics)
* [Development Scripts](#development-scripts)
* [Troubleshooting](#troubleshooting)
* [Why This Project?](#why-this-project)
* [License](#license)

---

## What is FeatureFlow?

FeatureFlow is a feature management platform that lets you **control who sees what**, **roll out gradually**, **A/B test variants**, and **kill switch** problematic features instantly.

**You can:**

* **Control** exposure by user, segment, country, app version, etc.
* **Roll out gradually** (e.g., 1% → 5% → 25% → 100%).
* **A/B test** multiple variants with weights.
* **Instantly disable** features with a kill switch.

### Simple Example

```ts
// Risky (ships to everyone at once)
if (true) {
  showNewCheckout();
}

// Safer with FeatureFlow
const useNewCheckout = await FeatureFlow.evaluateFlag('new_checkout', {
  user_id: currentUser.id,
  attributes: { country: currentUser.country }
});

if (useNewCheckout) showNewCheckout();  // gradually exposed
else showOldCheckout();                 // safe fallback
```

**Benefits:**

* 🛡️ **Reduced Risk** — issues affect fewer users at first
* 📊 **Data‑Driven** — compare versions, measure success
* ⚡ **Instant Control** — flip on/off without deploys
* 🎯 **Targeted** — VIPs, beta users, or regions first

---

## Architecture

**Components**

* **Control Plane (8080):** Admin API to create/update/delete flags, set targeting rules, manage variants, and audit changes.
* **Evaluation Service (8081):** Low‑latency flag evaluation with local/Redis caching and rule engine.
* **Metrics Service (9091):** Exposes Prometheus metrics (evaluation counts, latencies, cache hits, active flags).
* **Rule Engine:** Decides who gets what (attributes, segments, percentage rollout, A/B weights).
* **SDK (TS/JS):** Simple client library with local cache, polling, remote fallback, and analytics events.
* **PostgreSQL:** Source of truth (flags, configs per environment, rules, variants, segments, audit log).
* **Redis:** Performance cache for configs and (optionally) evaluation results.

**High‑level diagram**

```
Admin/UI ──> Control Plane ──> PostgreSQL
                         └─> Invalidate Redis

App ──> SDK ──> (local cache) ──╮
                  miss          │
                                v
                         Evaluation Service ──> Redis ──> (miss) ──> PostgreSQL
                                 │                                 ^
                                 └──────────────> Prometheus <─────┘
                                                   │
                                                   v
                                                Grafana
```

---

## How It Works (End‑to‑End Flow)

1. **Admin** creates/edits a flag in the **Control Plane** → stored in **PostgreSQL**; caches are invalidated.
2. **SDK** running in your app polls for configs and caches them locally.
3. When your app asks, “Does user123 get `dark_mode`?”, the **SDK**:

   * Uses **local cache** for instant decision; or
   * Calls the **Evaluation Service** which pulls from **Redis**, falling back to **PostgreSQL** if needed.
4. **Rule Engine** evaluates targeting (attributes, segments) and rollout percentage/bucketing.
5. **Metrics Service** exposes counters/latencies; **Grafana** dashboards visualize health and usage.

---

## Prerequisites

* **Node.js** 16+
* **Docker & Docker Compose**
* **Git**
* On Windows, prefer **PowerShell** (WSL/Git Bash can have Docker networking quirks).

---

## Quick Start

### 1) Clone & Install

```bash
git clone <your-repo>
cd FeatureFlow
npm install
```

### 2) Start Infrastructure (PostgreSQL, Redis, Prometheus, Grafana)

```bash
docker-compose up -d
# give containers time to come up
sleep 20
```

### 3) Initialize Database

```bash
npm run db:migrate   # create schema
npm run db:seed      # seed sample data & flags
```

### 4) Start Services (choose one method)

**Method A — Separate terminals (recommended):**

* **Terminal 1** — Evaluation Service

  ```bash
  npm run dev:eval
  ```
* **Terminal 2** — Control Plane

  ```bash
  npm run dev:control
  ```
* **Terminal 3** — Metrics Service

  ```bash
  npm run dev:metrics
  ```

**Method B — Scripts:**

```bash
bash ./setup.sh             # optional helper
bash ./test-complete.sh     # full integration test
node test-sdk.js            # SDK test once services are up
```

### 5) Verify Health

```bash
curl -s http://localhost:8081/health   # evaluation
curl -s http://localhost:8080/health   # control plane
curl -s http://localhost:9091/health   # metrics
```

---

## Services & Ports

| Service            | Port | Purpose                               |
| ------------------ | ---- | ------------------------------------- |
| Control Plane      | 8080 | Admin REST API for flags/config/rules |
| Evaluation Service | 8081 | Low‑latency flag evaluation           |
| Metrics Service    | 9091 | Prometheus metrics endpoint           |
| PostgreSQL         | 5432 | Primary database                      |
| Redis              | 6379 | Config/evaluation caching             |
| Grafana            | 3000 | Dashboards (admin/admin)              |
| Prometheus         | 9090 | Metrics collection                    |

---

## Environment Variables

Create a `.env` file in the project root:

```ini
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=canary_flags
DB_USER=canary_user
DB_PASS=canary_pass

# Servers
CONTROL_PLANE_PORT=8080
EVALUATION_SERVICE_PORT=8081
METRICS_PORT=9091

# Security
API_KEY=canary-12345-secret

# Runtime
NODE_ENV=development
LOG_LEVEL=info
```

> **Note:** Docker Compose is preconfigured to work locally. If you reset volumes, re‑run migrations and seed.

---

## API Examples

### 1) Health Checks

```bash
curl -s http://localhost:8081/health  # evaluation
curl -s http://localhost:8080/health  # control plane
curl -s http://localhost:9091/health  # metrics
```

### 2) Create a Flag (Control Plane)

```bash
curl -s -X POST http://localhost:8080/api/flags \
  -H 'X-API-Key: canary-12345-secret' \
  -H 'Content-Type: application/json' \
  -d '{
    "key": "new_dashboard",
    "name": "New Dashboard",
    "description": "Enable the redesigned dashboard",
    "flag_type": "boolean"
  }'
```

### 3) Update Flag Config per Environment

```bash
curl -s -X PUT http://localhost:8080/api/flags/new_dashboard/environments/production \
  -H 'X-API-Key: canary-12345-secret' \
  -H 'Content-Type: application/json' \
  -d '{
    "is_enabled": true,
    "rollout_percentage": 25
  }'
```

### 4) Evaluate a Flag (Evaluation Service)

```bash
curl -s -X POST http://localhost:8081/evaluate \
  -H 'Content-Type: application/json' \
  -d '{
    "flag_key": "dark_mode",
    "user_context": {
      "user_id": "user123",
      "attributes": {"country": "US", "tier": "premium"}
    },
    "default_value": false,
    "environment": "production"
  }'
```

---

## SDK Usage

```ts
import { createCanarySDK } from './dist/sdk/canary-sdk.js';

const sdk = createCanarySDK({
  apiKey: 'your-api-key',
  baseUrl: 'http://localhost:8081',
  environment: 'production'
});

sdk.on('ready', async () => {
  const isDarkMode = await sdk.evaluateFlag('dark_mode', {
    user_id: 'user123',
    attributes: { country: 'US', tier: 'premium' }
  }, false);

  console.log('Dark mode enabled:', isDarkMode);
});

sdk.on('error', (err) => console.error('SDK error:', err));
```

**Notes**

* The SDK keeps a **local cache** and **polls** the server for changes (default every 30s).
* If local cache is missing/stale, it **falls back to remote evaluation**.
* If the service is unreachable, it returns the **provided default** (safe fallback).

---

## Monitoring & Metrics

* **Grafana:** [http://localhost:3000](http://localhost:3000) (login: `admin` / `admin`)
* **Prometheus:** [http://localhost:9090](http://localhost:9090)

**Key Metrics** (exposed by Metrics Service @ 9091):

* `flag_evaluations_total{flag,environment,result}` — evaluation counts
* `flag_evaluation_duration_seconds` — evaluation latency histogram
* `flag_cache_hits_total{layer="sdk|redis"}` — cache hit counts
* `active_flags_total` — active flag count

Logs are written to `./logs/` (structured, with correlation IDs when available).

---

## Development Scripts

```bash
npm run build          # compile TypeScript → dist/
npm run dev            # watch mode (if configured)

# Individual services
npm run dev:eval       # start evaluation service only
npm run dev:control    # start control plane only
npm run dev:metrics    # start metrics service only

# Database
npm run db:migrate     # run migrations (create schema)
npm run db:seed        # seed sample flags/segments

# Health & Testing
npm run health         # (optional) health aggregator
node test-sdk.js       # simple SDK test
bash ./test-complete.sh
```

---

## Troubleshooting

### PostgreSQL authentication (v15+) — `password authentication failed`

Postgres 15 defaults to `scram-sha-256`. This project’s Docker is configured for `md5`. If you hit auth issues:

```bash
docker-compose down
docker volume rm FeatureFlow_postgres_data  # name may differ
docker-compose up -d
sleep 20
npm run db:migrate
npm run db:seed
```

### Windows / WSL notes

* Prefer **PowerShell** for best compatibility.
* Some bash scripts on WSL/Git Bash may hit Docker networking quirks; use the PowerShell equivalents where provided.

---

## Why This Project?

Demonstrates production‑grade **platform engineering** and **distributed systems** skills:

* 🏗️ Service‑oriented architecture; separation of control/data planes
* ⚡ Performance (Redis caching, connection pooling)
* 🔒 Reliability (gradual rollouts, kill switches, robust fallbacks)
* 📊 Observability (Prometheus, Grafana, structured logging)


---

## License

**MIT** — see `LICENSE`.

