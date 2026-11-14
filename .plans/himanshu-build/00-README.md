# Quorum: Your Build Pack (Himanshu)

**Read `../organizer-update.md` as well.** The organizers changed the rules at kickoff: finalists are picked by usage of Drex, Intern, NDI and partner tools. For you this adds a DeepInfra baseline to `05` (section 3.2 of that file) and a $10 budget plan for the frontier model (section 6).

**Read `../dataset-audit.md` too.** It corrects the data facts in `02` and `07`: only two suppliers (Cobalt, Ember) print an IBAN; select rows by the word `IBAN:` in the `words` column, not by `show_bank`; the workspace has 2 supplier searches, not 6.

**Read `../nace-docs-notes.md` section 3.** It folds your docs pack into the plan: try the free workspace catalog before `automatic-search` in `07`, add a hybrid "Drex first, LLM below a confidence threshold" row in `06`, and run everything at 8 in flight. It also corrects your guide's section 11: Intern is the open-source harness at `github.com/nace-ai/intern`, not the Slack agent.

Read this file first. Then read the numbered files in order. Each one is a single piece of work with inputs, outputs and a "done when" test.

## 1. What Quorum is

Quorum takes accounts-payable invoices and decides, for each one: `approve`, `verify`, or `block`.

- **NDI** (Nace Document Intelligence) reads the PDF and returns fields with page locations.
- **Plain code** compares the fields to a trusted supplier record and produces facts.
- **Drex** (Nace decision model) answers 12 yes/no questions and one final choice. It returns probabilities only. It writes no text.
- **A guard** (plain code) may raise the action. It may never lower it.
- **The UI** shows about 200 "organisms" in a dish. Each one is a real decision. A fraud wave spreads through them and agents warn their neighbors.
- **A race screen** runs Drex and a frontier LLM on the same cases, side by side.

Track: Apex Predator (Drex against a frontier LLM, measured). The name was Petri in older notes. It is now Quorum.

## 2. Who owns what

| Area | Owner |
|---|---|
| Case builder (PDFs, labels, trusted records) | **You** |
| Pre-parsing all case PDFs through NDI | **You** (using Dhruv's `intake.parse_document`) |
| Checks, policy, guard | **You** |
| Baseline (frontier LLM adapter) | **You** |
| Benchmark runner, metrics, results table | **You** |
| Race endpoint (backend side) | **You** |
| NDI and Drex client, intake, Drex panel | Dhruv |
| Dish simulation, WebSocket, all front end | Dhruv |

## 3. Files in this pack

| File | Work | Start |
|---|---|---|
| `01-contracts.md` | Shared data shapes. Read only; do not change without telling Dhruv | now |
| `02-case-builder.md` | `scripts/build_cases.py` | **now, needs no keys** |
| `03-preparse.md` | `scripts/preparse.py` | 11:20, needs NDI key |
| `04-checks-policy-guard.md` | `app/checks.py`, `app/policy.py` | 11:00, needs no keys |
| `05-baseline.md` | `app/baseline.py` | 12:30, needs an LLM key (stub first) |
| `06-benchmark-and-race.md` | `scripts/run_bench.py`, race endpoint | 12:30 |
| `07-drex-search.md` | Workspace of past documents; supplier history from Drex Search | 11:20, needs Nace key. Read `../nace-three-apis.md` first |

## 4. Your timeline

| Time | Work | Done when |
|---|---|---|
| before 11:00 | `02` case builder | 120 PDFs, `cases.jsonl`, `trusted.json` exist; one forged PDF checked by eye |
| 11:00 | `04` checks, policy, guard with unit tests | tests pass on hand-made inputs |
| 11:20 | `03` pre-parse (runs in the background) | 200 cached NDI results; field accuracy printed |
| 12:00 | Run the 25 development cases through Drex; tune question wording with Dhruv; pick the model | dev table printed |
| 12:30 | `05` baseline, `06` benchmark on 120 cases | `results.json`, `results.md` |
| 13:15 | Race endpoint; hand counters to the UI | race tab shows live numbers |
| 14:00 | Fill benchmark gaps; record both simulation runs for replay | replay files on disk |
| 14:30 | Freeze. Slides (3 at most) and submission form | submitted by 14:50 |

## 5. Rules (these protect the result)

1. **Expected labels never reach a model.** `cases.jsonl` is read only by `run_bench.py`, after decisions are stored.
2. **Trusted records live outside the document.** Text on an invoice that says "verified" is not verification.
3. **Both systems get the same input.** Same NDI output, same facts, same questions, same concurrency.
4. **Time the decision stage only.** Report NDI time on its own line.
5. **A failed request is a failure.** Never count it as an approval. Never drop it from the table.
6. **Report two Drex rows:** Drex alone, and Drex plus guard.
7. **IBANs are strings.** Money is an integer in minor units, with a currency code.
8. **Say only what we measured.** Vendor latency and price claims do not go on a slide.
9. **Label the data honestly:** "120 constructed scenarios on synthetic invoices. Not real fraud cases."
10. **Keys stay in `backend/.env`.** Never in code, logs or commits.

## 6. Environment

- Windows 11, Python 3.12, Node 22. `pyarrow` is installed. Install: `pip install pymupdf fastapi uvicorn httpx pydantic nace-sdk pytest`.
- Dataset: `d:\Coding\Drexathon\Quorum\dataset\data\invoice\test-00001.parquet` (1,370 rows) and `test-00000.parquet` (5,000 rows). Already downloaded.
- Code goes in `d:\Coding\Drexathon\Quorum\backend\`. Generated data goes in `backend\data\` (git-ignored).
- Set `STUB=1` to run without keys. Stub output must carry `"stub": true`.

## 7. Questions still open

- Baseline model: not chosen. No key yet. We will try to get one at the event. Build `05` so the provider is one config value.
- Rate limits for Drex and NDI: read them from the console Limits page after login.
- NDI host: docs say `console.nace.ai` with a Bearer header. Other pages say `ndi-api.nace.ai` with `X-API-Key`. Dhruv tests this at 11:00.
