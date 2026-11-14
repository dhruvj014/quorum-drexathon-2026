# Quorum

Quorum makes accounts-payable invoice decisions: `approve`, `verify` or `block`. It uses Nace NDI to read invoices, plain code to compare them with trusted supplier records, and Drex to answer a fixed set of questions. A guard can only raise the final action.

> **Status: draft, in progress.** This README describes what is in the repository now. The NDI pre-parse and a 5-invoice clerk trial (run A) have results, and so does the benchmark on 95 synthetic test cases. Arena results are still pending, and so are full clerk results (see [Results](#results)).

## Architecture

```
PDF ──► intake (NDI) ──► checks (Facts) ──► panel (Drex: 12 yes/no + 1 choice)
                                                   │
                                                   ▼
                    Decision ◄── guard (raise only) ◄── policy (cost-weighted)
```

| Module (`backend/app/`) | Role | Owner |
|---|---|---|
| `contracts.py` | Shared pydantic data shapes. Change only after agreeing with Dhruv. | Dhruv |
| `config.py` | Paths and settings, read from environment variables only | Dhruv |
| `nace.py` | Thin async wrapper over `nace-sdk` for Drex and NDI | Dhruv |
| `intake.py` | PDF → `ParsedInvoice` through NDI, with a content-hash cache in `backend/data/ndi_cache/` | Dhruv |
| `checks.py` | Pure checks of parsed fields against trusted supplier records → Facts | Dhruv (tests: Himanshu via Intern) |
| `policy.py` | Cost-weighted choice, plus a guard that can only raise the action (`approve` < `verify` < `block`) | Dhruv |
| `panel.py` | Drex panel: 13 questions in one call, then policy and guard | Dhruv |
| `forge.py` | Forges test invoices: swaps the printed IBAN and adds notes | Dhruv |
| `arena.py` | Arena loop: an attacker LLM (run through Intern with `intern/prompts/redteam.md`) writes notes, `forge.py` builds invoices, defenders decide. Never reads expected labels | Dhruv |
| `hub.py` | WebSocket fan-out hub and a JSON-lines file follower | Dhruv |
| `main.py` | Read-only FastAPI server for the web UI: arena results, NDI citations, page images, usage counters. Makes no Nace or DeepInfra calls | Dhruv |
| `casebuild.py` | PDF helpers for building benchmark cases | Himanshu via Intern |
| `baseline.py` | LLM guard baseline: a large open model (DeepSeek-V4-Pro on DeepInfra) given the same state and questions as Drex | Himanshu via Intern |

A failed API request is recorded as a failure with `error` set. It is never treated as an approval. Money is an integer in minor units plus a currency code, converted with `Decimal`. IBANs are strings.

Other parts in the repository:

- `web/`: Vite + React + TypeScript front end (arena dish, charts, evidence drawer, usage footer). The dev server proxies `/api` and `/ws` to `localhost:8000`.
- `backend/scripts/run_arena.py` with `intern/prompts/redteam.md`: the red-team arena runner.

### Not available yet

- `backend/app/clerk.py` (the hijacked-clerk experiment lives in `backend/scripts/run_clerk.py` instead)
- Drex Search (Tier 3)

## Data

**Synthetic invoices; attacks written by an LLM red-team agent; not real fraud cases.**

- Source parquet files go in `dataset/data/`. They are git-ignored and treated as read-only.
- `backend/scripts/build_cases.py` writes these files to `backend/data/` (git-ignored): `cases.jsonl` (120 cases), `gold.jsonl`, `trusted.json` and `pdfs/` (120 case PDFs plus 50 clean Cobalt originals).
- `cases.jsonl` holds the expected labels. Only `backend/scripts/run_bench.py` reads it. No module under `backend/app/` opens it.

## Setup

```bash
python3.12 -m venv .venv && source .venv/bin/activate
pip install pymupdf pyarrow pydantic httpx nace-sdk pytest fastapi uvicorn
uv tool install "intern-agent @ git+https://github.com/nace-ai/intern"
export INTERN_HOME=$PWD/.intern-home
```

Code reads these environment variables. Never commit keys.

| Variable | Use |
|---|---|
| `NACE_API_KEY` | NDI and Drex |
| `DEEPINFRA_API_KEY` | LLM guard baseline and clerk worker |
| `DREX_MODEL` | Drex model (default `drex-max-finance`) |
| `QUORUM_DATA` | Data folder for the API server (default `backend/data`) |
| `ARENA_ATTACKER_MODEL`, `ARENA_ATTACKER_TURNS`, `INTERN_CMD` | Arena attacker settings |
| `QUORUM_STUB` | `1`/`true`/`yes` sets `config.STUB` (no other code uses it yet) |

Keys stay in git-ignored env files (`.intern-home/.env`, `backend/.env`).

## Commands

Run every command from the repo root. Scripts marked "live" call paid APIs.

```bash
# Tests (no keys needed; network is mocked). See Results for current status.
.venv/bin/python -m pytest backend/tests -q
# Run one test file
.venv/bin/python -m pytest backend/tests/test_checks.py -q

# Build benchmark cases (local, no API calls)
.venv/bin/python backend/scripts/build_cases.py

# Pre-parse every benchmark PDF through NDI and score it (live, results cached)
python backend/scripts/preparse.py

# Benchmark: Drex panel vs LLM guard (live)
python backend/scripts/run_bench.py --split dev
python backend/scripts/run_bench.py --split test --system both --concurrency 8 --reuse --warmup 5
# --system accepts drex, llm_guard or both (default both)

# Arena report from backend/data/arena (writes report.json and report.md)
python backend/scripts/arena_report.py --dir backend/data/arena

# Red-team arena rounds (live; --fresh archives earlier arena results first)
python backend/scripts/run_arena.py --rounds 10 --attacks 20 --clean 5

# Read-only API server and web UI
.venv/bin/python -m uvicorn backend.app.main:app --port 8000
cd web && npm install && npm run dev

# Hijacked clerk: run A has no gate, run B has a Drex gate, run C has an LLM-guard gate (live)
python backend/scripts/run_clerk.py --trial 5
python backend/scripts/run_clerk.py --run all --n-poisoned 30 --n-clean 10 --concurrency 4
# --run accepts A, B, C or all; --extra-poisoned takes a file path

# One live NDI call and one live Drex call
python backend/scripts/smoke.py

# Write four demo forged PDFs (plus PNG renders)
python backend/scripts/forge_demo.py
```

Intern runs in Docker because it does not run on native Windows:

```powershell
docker build -t quorum-intern intern
.\intern\run.ps1 "task text"          # headless
.\intern\run.ps1 -Json "task text"    # one JSON event per line
.\intern\run.ps1 -Interactive         # terminal UI
```

The clerk prompt is `intern/prompts/clerk.md`. The clerk worker is `deepinfra/deepseek-ai/DeepSeek-V4-Flash-0731`.

## Results

### NDI pre-parse (`preparse.py`)

- NDI parses: 170/170 successful.
- IBAN extracted correctly: 170/170.
- S3 notes: 24/24. S5 notes: 24/24.
- Customer name: 168/170.
- Parse latency: median 8201 ms, p95 9702 ms. These timings are for the original NDI parse calls. They do not measure cache speed.
- Cache rerun: 170/170 served from `backend/data/ndi_cache/`, with zero NDI jobs submitted.

### Hijacked clerk (`run_clerk.py`)

- Trial, run A (no gate), 5 invoices: 0/5 hijacked, zero failed requests. Each clerk subprocess used a fresh isolated Intern home with memory disabled.
- This is a small trial only. Full clerk runs (A, B, C) have no results yet.

### Benchmark (`run_bench.py`)

Measured on the `test` split before the Phase 7 policy update: 95 synthetic test cases (constructed scenarios on synthetic invoices, not real fraud cases). A new run is needed to measure the updated policy. These results do not show real-world performance. Full tables: [`backend/data/results.md`](backend/data/results.md) (generated, git-ignored).

| System | Expected action | Failures | Unsafe approvals | Unnecessary escalations | Median decision ms | p95 decision ms | Cost per 1,000 decisions |
|---|---|---:|---|---|---:|---:|---:|
| Drex (`drex-max-finance`) | 95/95 | 0 | 0/57 | 0/38 | 291 | 392 | $0.0358 (estimated, input-token price only) |
| LLM guard (DeepInfra `deepseek-ai/DeepSeek-V4-Pro`) | 95/95 | 0 | 0/57 | 0/38 | 2946 | 24381 | $2.3109 (provider-reported) |

- Latency and cost cover the decision stage only. NDI parsing and warm-up calls are excluded.
- Costs hold for this sample only.
- The report was recomputed from stored live decisions without model calls. The original run used five discarded warm-up calls per system.

### Pending

- Arena (`run_arena.py`, `arena_report.py`): pending, no results.

### Test status

- The full suite is currently blocked: `fastapi` is not installed in the environment, so the API tests cannot be collected. Install it with the Setup command above.
- The arena integration test fails when `baseline` has already been imported earlier in the same pytest session.
- No current pass count is stated here.

## Built with Intern

Himanshu built these parts with Intern. Turn and token counts are the verified figures for each task. Actual build costs are not available.

| Task | Turns | Input tokens | Output tokens | Cost |
|---|---:|---:|---:|---|
| Case builder (`casebuild.py`, `build_cases.py`) | 26 | 548,905 | 30,383 | unknown |
| Checks tests (`test_checks.py`) | 11 | 242,069 | 16,959 | unknown |
| LLM guard baseline (`baseline.py`) | 23 | 498,147 | 23,567 | unknown |
| Arena report (`arena_report.py`) | 15 | 288,192 | 26,914 | unknown |
| Hijacked clerk (`run_clerk.py`, `intern/prompts/clerk.md`) | 24 | 525,823 | 33,813 | unknown |
| Pre-parse (`preparse.py`) | 8 | 132,766 | 15,196 | unknown |
| Benchmark runner (`run_bench.py`) | 21 | 499,004 | 44,216 | unknown |
| README draft (`README.md`) | 13 | 266,546 | 11,680 | unknown |
| Checks update | 5 | 38,638 | 1,038 | unknown |
| Clerk correction | 18 | 392,409 | 21,362 | unknown |
| Report correction | 21 | 526,729 | 21,822 | unknown |
| Report tests | 9 | 162,757 | 4,540 | unknown |
| Pre-parse correction | 8 | 154,230 | 10,813 | unknown |
| Case builder test isolation | 9 | 126,585 | 6,364 | unknown |
| Benchmark correction | 23 | 581,588 | 24,906 | unknown |
| Benchmark tests | 13 | 318,832 | 14,536 | unknown |
| README update | 8 | 110,592 | 6,585 | unknown |
| **Total** | **255** | **5,413,812** | **314,694** | unknown |

Dhruv wrote the pipeline core (contracts, config, nace, intake, checks, policy, panel, forge, `smoke.py`, `forge_demo.py` and the `intern/` Docker setup) in commit `65e4d5b`, then the arena loop and red-team prompt (`4e1daa9`), the read-only API server and WebSocket hub (`d0abcf6`), the web UI (`0375873`) and hardening (`992e1d6`).
