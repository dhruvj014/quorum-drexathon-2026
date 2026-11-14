# Brief: API server (main.py, hub.py)

Read first: `AGENTS.md`, `.plans/SPEC-FINAL.md` sections 3, 4, 7 and 10, and `.plans/briefs/arena.md` (it defines the files this server reads: `backend/data/arena/attacks.jsonl`, `rounds.jsonl`, `known_attacks.json`; another agent is writing `arena.py` right now, so do not import it, do not edit it and do not run its tests). Look at one file in `backend/data/ndi_cache/` and at `backend/app/contracts.py` for the data shapes.

The server only reads files. It makes no Nace or DeepInfra calls. It never opens `cases.jsonl`.

## Build

1. `backend/app/hub.py`: `class Hub` with `async connect(ws)`, `disconnect(ws)`, `async publish(event: dict)` (drops dead sockets), and `async tail_jsonl(path, event_type, poll_s=0.5)`: follows a JSON-lines file that another process appends to (file may not exist yet; start at the current end; survive truncation) and publishes `{"type": event_type, "data": <line>}` for each new line.

2. `backend/app/main.py`: FastAPI app `app`. On startup, start tail tasks for `arena/attacks.jsonl` (type `attack`) and `arena/rounds.jsonl` (type `round`). CORS open for `http://localhost:5173`. The data folder comes from `config.DATA` but must be overridable for tests (env `QUORUM_DATA` or a function the tests can patch).
   - `GET /api/health` -> `{"ok": true}`.
   - `GET /api/arena/rounds` -> list of round records.
   - `GET /api/arena/attacks?round=N` -> list of attack records (all rounds if no parameter). Add to each a `key` = `"{round}-{id}"`.
   - `GET /api/arena/attacks/{key}` -> one attack record plus `parsed`: the mapped fields with statuses and citations (page, polygons, source_text) from `ndi_cache/{doc_hash}.json`, or `null` if not cached.
   - `GET /api/arena/attacks/{key}/page.png` -> page 1 of that attack's PDF rendered with pymupdf at 110 dpi, plus response headers `X-Page-Width` and `X-Page-Height` in PDF points. The PDF path comes from the record and must resolve inside the data folder; otherwise 404.
   - `GET /api/arena/report` -> contents of `arena/report.json` if it exists, else `{}`.
   - `GET /api/usage` -> `{"nace": <last entry of usage.json, or its dict>, "intern": {"runs", "turns", "drex_asks", "input_tokens", "output_tokens"} summed over the `run_end` lines of `intern-logs/*.jsonl` (files are UTF-8, maybe with BOM, maybe UTF-16; read tolerantly), "arena": {"rounds", "attacks", "attacker_input_tokens", "attacker_output_tokens", "attacker_turns"} from `rounds.jsonl`}`. Missing files give zeros.
   - `WS /ws`: on connect send `{"type": "hello"}`, then everything the hub publishes.
   - If `web/dist` exists, serve it at `/`.

3. `backend/tests/test_api.py` and `backend/tests/test_hub.py`: use `fastapi.testclient.TestClient` and a temporary data folder with small made-up files (a 1-page PDF made with pymupdf). Cover every route, the path check (a record pointing outside the data folder gives 404), a missing file, and `tail_jsonl` picking up an appended line.

## Done when
- `python -m pytest backend/tests/test_api.py backend/tests/test_hub.py -q` passes (run only these two files).
- `python -m uvicorn backend.app.main:app --port 8000` starts; `curl localhost:8000/api/health` and `/api/usage` answer. Stop the server after.
- Final report, short: files created, test summary line, and the exact JSON shape of each route in a compact list (the web UI agent will read it). Also write that route list to `backend/API.md`.
