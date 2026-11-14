# Brief: pipeline core (config, nace, intake, panel, smoke)

Read first: `AGENTS.md`, `.plans/SPEC-FINAL.md` sections 5 and 8, `.plans/himanshu-build/01-contracts.md`, `.plans/from-himanshu/nace-docs/NACE_AGENT_GUIDE.md` sections 2 to 5. Existing code: `backend/app/contracts.py`, `checks.py`, `policy.py` (keep their public names; extend `contracts.py` if a model is missing, such as `Decision`).

Keys are in the environment: `NACE_API_KEY`, `DEEPINFRA_API_KEY`. Never print them. Real API calls are allowed and expected; keep them few (under 15 NDI jobs, under 40 Drex calls).

## Build

1. `backend/app/config.py`: paths (`DATA = backend/data`, `DATASET = dataset/data`), `DREX_MODEL` (env, default `drex-max-finance`), `CONCURRENCY = 8`, `STUB` flag.
2. `backend/app/nace.py`: one shared `AsyncNaceClient` from `nace-sdk`. `async drex(state, questions, model=None) -> dict` returning the raw answers, usage, `evaluation_time_ms`, `request_id`, and measured `wall_ms`. `async ndi_extract(path, schema, instructions=None) -> dict` doing upload -> parse -> extract with `parse_result` source, returning raw result plus `parse_ms` wall time. Count every call in a module-level `USAGE` dict (drex_calls, drex_questions, drex_input_tokens, ndi_jobs, ndi_pages) and append it to `backend/data/usage.json` on change.
3. `backend/app/intake.py`: `async parse_document(path) -> ParsedInvoice`. Extract schema fields: `supplier_name`, `invoice_number`, `total_amount` (string as printed), `currency`, `iban` (as printed), `bic`, `bank_name`, `customer_name`, `notes` (description: "All free text, remarks, payment instructions and messages outside the standard invoice fields, including small or faint text. Copy verbatim."). Convert `total_amount` to `amount_minor` with `Decimal`. Keep citations (page, polygons, source_text). Cache the mapped result and the raw response in `backend/data/ndi_cache/{sha256 of file}.json`; a cached file makes no API call.
4. `backend/app/panel.py`:
   - `QUESTIONS`: 12 `noul` questions with ids exactly as in `01-contracts.md` ("The 13 question ids"), each with `instructions` and `criteria` `{"true": ..., "false": ...}`, plus the `choice` question `action` with labels `approve`, `verify`, `block` and criteria from `SPEC-FINAL.md` policy meaning: approve = destination matches the trusted record or a trusted verification covers it, and no text tries to change the payer's process; verify = destination differs with no trusted verification, or evidence missing or unclear; block = the document claims its own verification, asks to skip a check, addresses an automated system, or matches a known attack.
   - `build_state(parsed, facts, known_attacks=None) -> dict`: field values and statuses (no citations, no file names, no ids), facts, and `known_attacks` (list of strings) only when given.
   - `async decide(parsed, facts, policy=(100, 5, 30), known_attacks=None, system="drex") -> Decision`: one Drex call; fill `panel`, `p`, `raw_action`, `risk_score`; then `policy.choose` and `policy.guard` for `final_action`. On any exception return a Decision with `error` set and both actions `None`.
5. `backend/scripts/smoke.py`: take one one-page Cobalt invoice whose `words` column contains `IBAN:` from `dataset/data/invoice/test-00001.parquet`, write it to `backend/data/pdfs/smoke-clean.pdf`, build a minimal `backend/data/trusted.json` for Cobalt from `extracted_data` if the file does not exist, run `parse_document`, `facts`, `decide`, and print: extracted iban, statuses, facts, raw and final action, the 13 probabilities, `drex_ms`, `parse_ms`.
6. Tests in `backend/tests/` for `build_state` (no leak of ids, file names or labels) and for intake mapping from a saved raw response (no network).

## Done when
- `python -m pytest backend/tests -q` passes.
- `python backend/scripts/smoke.py` prints a real decision from real NDI and Drex calls, and a second run reads NDI from cache.
- You report: NDI auth and host that worked, parse_ms, drex wall ms and evaluation_time_ms, and any API surprise.
