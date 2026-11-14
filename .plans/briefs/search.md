# Brief: Drex Search (supplier history from past invoices)

Read first: `AGENTS.md`, `.plans/from-himanshu/nace-docs/NACE_AGENT_GUIDE.md` (the Workspaces / Search sections; check exact fields in `docs/openapi.json` and `docs/pages/docs__workspaces*.md`, `docs__developer-tools__python__workspaces.md`, `docs__developer-tools__python__search.md`), `.plans/nace-three-apis.md` section 2, `.plans/himanshu-build/07-drex-search.md` (background only; this brief is smaller and wins). Existing code: `backend/app/nace.py`, `config.py`, `forge.py` (`list_sources`), `checks.py` (`normalise_iban`), `main.py`, `backend/scripts/smoke.py`.

Keys are in the environment. Never print them. Real calls are expected. Budget: 1 workspace, about 80 uploads, 1 ingestion, at most 8 searches (the account limit is 60 searches per 10 minutes).

Another agent is editing `backend/app/arena.py`, `backend/scripts/run_arena.py`, `backend/tests/test_arena.py` and `intern/prompts/`: do not touch them and do not run `test_arena.py`. Do not edit `checks.py`, `contracts.py`, `panel.py` or `policy.py`.

## Build

1. `backend/app/nace.py`: add `async search(workspace_id, query, mode="agent", path_prefix=None, output_schema=None, top_k=None) -> dict` returning the answer, `structured_answer`, `confidence`, `evidences` (source_path, page, quote, relevance), job id and `wall_ms`; plus the small helpers needed to create a workspace, upload a file into it and run ingestion. Use `nace-sdk` where it has the call, plain `httpx` otherwise. Count `search_calls`, `workspace_files` in `USAGE` (and make `usage_totals` sum them).
2. `backend/scripts/build_history.py`:
   - Pick 60 one-page Cobalt Wholesale invoices that print `IBAN:` and are **not** among the last 120 entries of `forge.list_sources()` (those are the arena's sources). If `invoice/test-00000.parquet` has Cobalt rows, use them too. Add 20 Ember Bikes invoices as other-supplier clutter if that is easy; skip if not.
   - Only untouched originals go into the workspace: no forged PDF, nothing from `backend/data/`.
   - Create workspace `quorum-ledger` (reuse the id in `backend/data/workspace.json` if present), upload 8 at a time under `invoices/{company}/{doc_id}.pdf`, ingest, wait, print how many files are ingested and how long it took.
   - One search for Cobalt: "Which bank account (IBAN and BIC) does Cobalt Wholesale Ltd ask to be paid into on its past invoices? List every distinct IBAN.", `path_prefix` `invoices/`, with an `output_schema` `{ibans: [{iban, bic, bank_name, documents_seen}]}`. If `agent` mode fails or takes over 90 s, try `fact` with `top_k` 20.
   - Save `backend/data/history/cobalt-wholesale-ltd.json`: query, mode, structured answer, evidences, confidence, job id, wall ms, ingested file count, and `matches_dataset`: whether the top IBAN (normalised) equals the IBAN in the dataset's `extracted_data` for Cobalt. Print that result plainly; never hide a mismatch.
   - Stop rule: if ingestion is not finished after 6 minutes of waiting, save what is known with `"status": "ingesting"` and report; do not loop forever. The script must be safe to run again later and pick up where it left off.
3. `backend/app/history.py`: `load_history(supplier_id) -> dict | None` (reads the saved file; no API call) and `history_summary(h) -> dict` with `ibans` (normalised, with documents_seen), `distinct_ibans`, `documents_seen`, `confidence`, `matches_dataset`, and up to 3 evidence quotes with file name and page. No file paths beyond the file name.
4. `backend/app/main.py`: `GET /api/history/{supplier_id}` -> the summary plus `wall_ms` and `mode`, or 404. Add the search counters to `/api/usage`. Update `backend/API.md`.
5. Tests, no network: `backend/tests/test_history.py` (summary from a made-up saved file, missing file, mismatch flagged) and the new route in `test_api.py`.

## Done when
- `python -m pytest backend/tests -q --ignore=backend/tests/test_arena.py` passes.
- `python backend/scripts/build_history.py` ran against the real API, or stopped by the stop rule.
- Final report, short: files created, test summary line, files ingested and ingestion time, search mode and wall time, the IBAN found and whether it matches the dataset, two evidence quotes, and anything the docs got wrong.
