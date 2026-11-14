# Brief: web UI v2 (show each Nace product at work; two test modes; any number of defenders)

Read first: `AGENTS.md`, `backend/API.md` (exact routes and shapes), `.plans/briefs/web.md` (what exists), then the files in `web/src/`. Change only files under `web/`. Do not edit anything under `backend/`, and do not open files under `backend/data/` (use `backend/API.md` and the demo data for shapes).

You cannot see a browser. Keep `npx tsc --noEmit` and `npm run build` clean.

## What changed in the data
- Round and attack records now carry `mode`: `swap` (the IBAN was replaced; a missing `mode` means `swap`) or `redirect` (bank details untouched, only the note is hostile; invoice `kind` is `poisoned`). `kind` is `forged`, `poisoned` or `clean`.
- Defenders are no longer a fixed list. Read the keys of `defenders` in the round records: today `drex`, `drex+memory`, `drex-max-v1.1`, `drex-v2.0`, later `llm_guard`. Each defender's scores also carry `model`, `min_risk`, `median_risk`, `max_p_approve`.
- Round records carry `attacker.isolated`, `attacker.recalled_pages`, `with_risk`, `known_attacks_used`.
- `GET /api/usage` `nace` now includes `search_calls` and `workspace_files`.
- New route `GET /api/history/{supplier_id}` (use `cobalt-wholesale-ltd`): `{status, ibans: [{iban, bic, bank_name, documents_seen}], distinct_ibans, documents_seen, confidence, matches_dataset, evidence: [{file, page, quote}], wall_ms, mode}`; 404 if not built.

## Build

1. **Pipeline strip** across the top, under the header: four stages in a row joined by arrows, each a card with the product name, one line saying what it does here, and live numbers from `/api/usage` (refresh every 5 s):
   - **NDI** "reads every invoice PDF": jobs, pages.
   - **Drex Search** "finds the supplier's bank account in past invoices": files in workspace, searches; and from `/api/history/cobalt-wholesale-ltd` the IBAN found, "seen in at least N documents", confidence, a tick or a cross for `matches_dataset`, search time in seconds.
   - **Drex** "decides approve, verify or block": calls, questions, input tokens; the list of Drex models seen in the round records.
   - **Intern** "runs the red-team agent and built this project, supervised by Drex": runs, turns, Drex supervision asks; arena attacker turns and tokens.
   A card with no data shows "not run yet", never zeros that look like results.
2. **Mode switch** next to the defender switch: `swap` | `redirect` (hide a mode with no rounds; default to the newest mode that has data). The dish, charts and totals table show only the selected mode. One line under the switch explains the mode in plain words.
3. **Defender switch and charts** built from the defender keys found in the data, with a stable colour per defender. The breach chart gets a second small chart beside it: lowest risk score by round per defender (`min_risk`), since breaches can be zero. Totals table: one row per defender with model, attacks, raw breaches, breaches, false alarms out of clean invoices, failures, median ms.
4. **Evidence drawer**: three stacked bands, each headed by the product that produced it.
   - "NDI read this document": the page image with the outlines (existing), field list with status.
   - "Drex Search found this history": the IBAN from history against the IBAN printed on this invoice (match or mismatch shown plainly), and up to 3 quotes with file name and page. If history is missing: "not built".
   - "Drex decided": existing defender cards, for every defender in the record, showing `raw_action` and `final_action` separately with labels "model" and "after policy and guard".
5. Demo data (`?demo=1`) updated to cover both modes, four defenders and a history record, still labelled "demo data".

## Done when
- In `web/`: `npx tsc --noEmit` and `npm run build` finish with no errors.
- Final report, short: files changed, the build summary line, what a person should check by eye.
