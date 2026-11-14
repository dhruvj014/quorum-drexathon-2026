# 06. Benchmark and Race (`backend/scripts/run_bench.py`, race endpoint)

Start at 12:30. Needs: cached NDI results (`03`), your functions (`04`), Dhruv's `panel.decide`, and `decide_llm` (`05`). Budget: 60 minutes for the benchmark, 30 for the race.

## Part A: Benchmark

### Goal

One table that a judge can read in 10 seconds, and a JSON file that backs every number in it.

### Run

```text
python scripts/run_bench.py --split dev            # 25 cases, for tuning
python scripts/run_bench.py --split test           # 95 cases, the reported run
python scripts/run_bench.py --split test --system drex --concurrency 8
```

Steps for each system (`drex`, `baseline`):
1. Load case ids from `cases.jsonl`. Load each `ParsedInvoice` from the NDI cache. Compute `Facts`.
2. Call `decide` or `decide_llm` under `asyncio.Semaphore(concurrency)`. Same concurrency for both systems.
3. Store every `Decision` in `backend/data/decisions/{system}/{case_id}.json`.
4. Only after all decisions are stored, join with the labels and compute metrics.

Before the reported run, do a warm-up of 5 calls per system and discard them. Record the run's start time, model names, concurrency and policy values in the output.

Report the **test split (95 cases)** on the slide. The 25 development cases were used for tuning, so they are not reported. State this in one line.

### Metrics

For each of four rows (Drex alone, Drex + guard, Baseline alone, Baseline + guard):

| Metric | Definition |
|---|---|
| Correct action | action equals `expected_action`, over all cases |
| Unsafe approvals | `forged` is true and action is `approve` (count and rate over forged cases) |
| Unnecessary escalations | `forged` is false and action is not `approve` (count and rate over non-forged cases) |
| Injection blocked | S5 cases with action `block`, out of 19 |
| Bypass text blocked | S3 cases with action `block`, out of 19 |
| Failures | decisions with `error` set |

"Alone" rows use `raw_action`. "+ guard" rows use `final_action`. A failure counts as wrong in every accuracy metric and is also listed in its own column.

For each system (two rows): p50 and p95 `wall_ms`, decisions per second over the whole run at the stated concurrency, mean input and output tokens, cost per 1,000 decisions at list price.

Headline ratios, computed by the script and not by hand: `baseline p50 / drex p50`, `baseline cost / drex cost`.

Also emit a per-scenario grid (5 scenarios x 4 rows, correct count out of 19). This is the honest view if the totals look close.

### Output

- `backend/data/results.json`: everything above plus the run metadata.
- `backend/data/results.md`: the table in Markdown, with the three footnotes below.
- `GET /api/results` (Dhruv's `main.py`) serves `results.json`. Tell Dhruv when the file shape is final.

Footnotes that must appear with the table:
1. "95 constructed scenarios on synthetic invoices (Company Documents v2, Apache-2.0). Not real fraud cases."
2. "Decision stage only. Both systems received the same NDI output. NDI median parse time: X s, reported separately."
3. "Cost at public list price on 2026-11-14. Latency measured from our laptop on venue Wi-Fi."

### Done when

- The script runs end to end on the test split for both systems and writes both files.
- Running it again with `--reuse` recomputes metrics from stored decisions with no API calls.
- You checked 5 rows by hand against the stored decisions.

### If the numbers disappoint

- **Drex alone approves forged cases:** that is what the "Drex + guard" row is for. Show both.
- **Drex does not block S3 or S5:** work with Dhruv on question wording using the development cases only. If it still fails, report it. The speed and cost claim stands without it.
- **Baseline is as accurate as Drex:** expected. The claim is "same decisions, N times faster, M times cheaper". Do not stretch it.
- **Baseline is unavailable:** the table shows the Drex rows only, and the race screen is tagged "simulated". Say so in the pitch.

## Part B: Race

### Goal

A live, visible run of both systems on the same cases, for the first 30 seconds of the demo.

### Backend

`POST /api/race/start` with `{"n": 60, "concurrency": 4}`. Add it as a router in `app/race.py`; Dhruv mounts it.

- Pick `n` cases from the cached set in a fixed order.
- Start two tasks at the same moment, one per system, same concurrency.
- After every finished decision, publish an event on Dhruv's WebSocket hub: `hub.publish({...})`.

```json
{"type": "race", "system": "drex", "done": 17, "total": 60, "last_ms": 41, "p50_ms": 38, "elapsed_ms": 912, "errors": 0, "last_action": "verify", "case_id": "c-0011-s3", "stub": false}
```

- When both finish, publish `{"type": "race_done", "drex": {...}, "baseline": {...}}` with the totals and the two ratios.

These are live calls, not cache reads. If a system is stubbed, `stub` is true and the UI tags that side "simulated".

### Replay fallback

Write every race event with its time offset to `backend/data/replays/race.jsonl`. `POST /api/race/replay` plays the file back at the recorded pace, with `"replay": true` on each event. The UI shows a "replay" tag. Record one good run by 14:15.

Do the same for the two dish runs: Dhruv's simulation writes `replays/sim-warn-off.jsonl` and `replays/sim-warn-on.jsonl`. At 14:00, start both runs once and confirm the files exist.

### Done when

- Pressing start in the race tab shows both counters moving from real calls.
- The replay plays with the network off.

## Part C: Slides and submission (14:30)

Three slides at most: (1) the problem in one sentence with one forged invoice, (2) the results table with footnotes, (3) architecture in one line: `NDI -> facts -> Drex -> guard`. Everything else is the live app. Ask an organizer at check-in what the submission form needs (repository link, video, description) so nothing is a surprise at 14:50.
