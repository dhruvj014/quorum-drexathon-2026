# Brief: finish Drex Search (write and run build_history.py)

Read first: `AGENTS.md`, `.plans/briefs/search.md` (the full task; an earlier run finished items 1, 3, 4 and 5 and ran out of turns before item 2). Then read only what you need from `backend/app/nace.py` (the helpers `create_workspace`, `find_workspace`, `upload_file`, `list_files`, `start_ingest`, `job_status`, `workspace_stats`, `search`) and `backend/app/history.py`. Do not re-read the Nace docs unless a call fails.

Another agent is editing `backend/app/arena.py`, `backend/scripts/run_arena.py`, `backend/tests/test_arena.py` and `intern/prompts/`: do not touch them and do not run `test_arena.py`.

## Known facts (from the earlier run; trust them)
- Cobalt Wholesale: 109 eligible one-page rows with `IBAN:` in `dataset/data/invoice/test-00000.parquet`. Take the 60 Cobalt documents from that file only (the arena uses `test-00001`). Dataset IBAN `GB18 1790 8734 9062 1374 9599`, BIC `COBAGB41`.
- Ember Bikes: 107 eligible rows in `test-00000`, IBAN `FR83 8390 5916 0870 4173 9196`. Take 20 as other-supplier clutter.
- SDK notes: the workspace file list is `client.workspaces.files.list`; upload `on_conflict` accepts only the values the SDK lists.

## Do
1. Write `backend/scripts/build_history.py` exactly as item 2 of `.plans/briefs/search.md` describes (select, create or reuse workspace, upload 8 at a time, ingest, wait up to 6 minutes, one search for Cobalt, save `backend/data/history/cobalt-wholesale-ltd.json` with `matches_dataset`). Safe to run again: skip files already uploaded, reuse `backend/data/workspace.json`.
2. Run it against the real API. Budget: 1 workspace, 80 uploads, 1 ingestion, at most 8 searches. Write the script in one go and run it early; fix what fails. Do not spend turns on polish.
3. Run `python -m pytest backend/tests -q --ignore=backend/tests/test_arena.py`.

## Done when
- The script ran, or stopped by the 6-minute stop rule with `"status": "ingesting"` saved.
- Final report, short: files ingested and ingestion time, search mode and wall time, the IBAN found and whether it matches the dataset (say so plainly either way), two evidence quotes with file name and page, the test summary line.
