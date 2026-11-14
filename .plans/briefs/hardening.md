# Brief: hardening from Himanshu's review of Phase 1

Read first: `AGENTS.md` (rules 3, 4 and 5), then `backend/app/intake.py`, `checks.py`, `nace.py`, `policy.py`, `panel.py`, `forge.py`, `main.py` and their tests.

Another agent is editing `backend/app/arena.py`, `backend/scripts/run_arena.py`, `backend/tests/test_arena.py` and `intern/prompts/` right now: do not open them for writing and do not run `test_arena.py`. A teammate is writing `backend/tests/test_checks.py`: do not create that file; put new tests for `checks.py` in `backend/tests/test_hardening.py`. No real API calls are needed for this task; make none.

## Changes

1. **Failed NDI job must not look like a result** (`intake.parse_document`). If the NDI result status is anything other than succeeded, raise an exception (`IntakeError`, with the status and any error text). Write the cache only for succeeded results. When reading the cache, ignore an entry whose stored raw status is not succeeded (treat as not cached; do not delete the file).
2. **`amount_unusual` question** (`panel.py`): the band 0.5 to 2 flags 28% of clean invoices. Put the band in two module constants, `AMOUNT_RATIO_LOW = 0.2` and `AMOUNT_RATIO_HIGH = 5.0`, and build the question text from them. Comment: untuned default, to be tuned on the 25 development cases only.
3. **`checks.load_trusted`**: default path `config.TRUSTED_FILE`; raise `FileNotFoundError` for a missing file; raise `ValueError` if the JSON is not a dict keyed by supplier id. Update callers.
4. **Usage across processes** (`nace.py`, `main.py`): each process gets a `RUN_ID` (uuid hex) at import; every snapshot line written to `usage.json` carries `run_id` and that process's counts so far. Add `usage_totals(path=None) -> dict`: for each `run_id` take its last line, then sum the counters over runs (lines without `run_id` each count as their own run only if they are the last such line; keep it simple and documented). `GET /api/usage` returns these totals under `nace`. Check how the file is written today (one JSON document or JSON lines) and keep reading old content without crashing.
5. **`policy.guard`** and `policy.choose`: raise `ValueError` on an action that is not `approve`, `verify` or `block`. Check `panel.decide` still returns a Decision with `error` set (not an exception) on failures.
6. **`backend/requirements.txt`**: `nace-sdk`, `pymupdf`, `pyarrow`, `pydantic`, `httpx`, `fastapi`, `uvicorn[standard]`, `python-dotenv`, `pytest`, `pytest-asyncio`.
7. **`forge.random_iban`**: default `length=24`, to match the IBANs printed in the dataset (for example `GB18 1790 8734 9062 1374 9599`). Printed in groups of four.

## Done when
- `python -m pytest backend/tests -q --ignore=backend/tests/test_arena.py` passes, with new tests for items 1, 3, 4, 5 and 7.
- Final report, short: per item one line saying what changed, then the test summary line.
