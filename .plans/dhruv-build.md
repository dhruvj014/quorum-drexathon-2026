# Quorum: Dhruv's Build Plan (pipeline, simulation, front end)

Companion to `build-spec.md` and `himanshu-build/`. Six work items in order. Each has a "done when".

## Things Himanshu imports from you (do not rename)

| Symbol | File | Needed by |
|---|---|---|
| `ParsedInvoice`, `Facts`, `Decision`, `TrustedSupplier` | `app/contracts.py` | everything |
| `parse_document(path) -> ParsedInvoice` (async, disk cache) | `app/intake.py` | pre-parse, 11:20 |
| `QUESTIONS`, `build_state(parsed, facts)` | `app/panel.py` | baseline |
| `decide(parsed, facts, policy) -> Decision` (async) | `app/panel.py` | benchmark, race |
| `hub.publish(event: dict)` | `app/hub.py` | race |

Write `contracts.py` and a stubbed `intake.py` first and push them, so he is never blocked.

## D1. Scaffold and stubs (before 11:00, 30 min)

- `backend/`: FastAPI app, `/ws` endpoint, `hub.py` (set of sockets, `publish` sends JSON to all), `config.py` reading `.env` (`NACE_API_KEY`, `STUB`, `DREX_MODEL`, `NDI_BASE`, `BASELINE_*`).
- `nace.py`: two functions, `drex(state, questions, model)` and `ndi_extract(path, schema)`. Real path uses `httpx.AsyncClient` with one shared client (keep-alive matters for latency). Stub path returns shaped fake data with `"stub": true`.
- `web/`: Vite + React + TS. One `useSocket` hook, one store keyed by event `type`. Tabs: Dish, Race.
- `.gitignore`: `.env`, `backend/data/`, `node_modules/`.
- Done when: the browser shows fake tick events arriving from the backend.

## D2. First real calls (11:00, 20 min)

1. `GET /v1/models` with the key. Note the model names.
2. One Drex call with 1 `noul` question. Print the full response. Record `evaluation_time_ms` and wall time.
3. NDI: upload one original PDF, parse, extract. Try `console.nace.ai` with Bearer first. If 401 or 404, try `ndi-api.nace.ai` with `X-API-Key`.
4. Read the console Limits page. Write the RPM and in-flight numbers into `config.py`. Tell Himanshu.
5. Scale test: one Drex call with 50, 200, then 500 `choice` questions. Record time and whether answers stay sensible. This decides the dish design (one call per tick, or one per supplier cluster).
- Done when: measured numbers are in a note in `config.py` and Himanshu has a working `parse_document`.

## D3. Intake and panel (11:20, 40 min)

**Extract schema** (root object; no `format`, `$ref`, `anyOf`):

| Field | Type | Description text |
|---|---|---|
| `supplier_name` | string | Company that issued the invoice |
| `invoice_number` | string | |
| `total_amount` | string | Grand total exactly as printed |
| `currency` | string | ISO code |
| `iban` | string | IBAN exactly as printed, with spaces |
| `bic` | string | |
| `bank_name` | string | |
| `customer_name` | string | Bill-to party |
| `notes` | string | All free text, remarks and instructions outside standard invoice fields, including small or faint text |

Convert `total_amount` to `amount_minor` in code with `Decimal`. Cache the raw NDI response as well as the mapped `ParsedInvoice`.

**`build_state`** returns: the field values and statuses (no citations, no file name, no doc id), the `Facts`, and a two-line supplier summary from the trusted record (median amount, whether any verification exists for the IBAN on this invoice). Print one state and read it for leaks.

**`QUESTIONS`**: 12 `noul` + 1 `choice`, ids as in `himanshu-build/01-contracts.md`. The `choice` criteria:
- `approve`: destination matches the trusted record, or a trusted verification covers this exact destination; no text tries to change the payer's process.
- `verify`: destination differs with no trusted verification, or evidence is missing or unclear.
- `block`: the document claims its own verification, asks to skip a check, or addresses an automated system.

**`decide`**: one Drex call; map answers to `panel[]` and `p`; `raw_action` = top label; then Himanshu's `choose` and `guard` for `final_action`. On any error, return a `Decision` with `error` set and actions `null`.

- Done when: `decide` on one cached S1 and one cached S3 returns different actions with a real `request_id`.

## D4. Evidence drawer = the 12:30 checkpoint (12:00, 30 min)

- `GET /api/doc/{id}/page.png`: PyMuPDF renders page 1 at 150 dpi, cached.
- `GET /api/decision/{id}`: the `Decision` plus the `ParsedInvoice` it used.
- Drawer: page image with an SVG overlay of citation polygons (IBAN box emphasised when `bank_differs`), 12 horizontal bars sorted by `p_yes`, chips for `raw_action` and `final_action`, guard findings in plain words, `decision_ms`, and a `live` / `replay` / `simulated` tag.
- Done when: clicking a case id in a plain list opens the drawer with a real decision. This is the checkpoint. If it is not done by 12:45, the dish becomes a static grid.

## D5. Dish and simulation (12:30, 90 min)

**World** (`sim.py`, fixed seed):
- Suppliers: nuclei at fixed points. Customers: one organism each, placed in a cluster around their supplier with jitter. Neighbors: 4 nearest.
- Each organism holds a queue of cases. Healthy population holds originals (`o-XXXX`, S1). A compromised supplier delivers forged cases (S2, S3, S5 from the 120) to its customers.
- Step 0 (on load): every organism's first invoice gets a real per-invoice `decide` call in the background, 8 at a time. Organisms fade in as their decision arrives. This is the "every dot is a real decision" claim.

**Tick** (one Drex call):
- `state`: tick number, list of suppliers with a flagged count, global policy.
- One `choice` question per organism with a pending invoice. Labels `pay`, `verify`, `block`. The instruction text carries: that organism's `Facts` for the pending invoice, the note text, and `warnings_received` (count and supplier) from last tick.
- Apply: forged + `pay` -> `infected`; forged + `verify` or `block` -> `immune`, and each neighbor gets a warning for that supplier next tick; clean + `pay` -> stays `healthy`.
- Publish a `tick` event with changed organisms, `evaluation_time_ms`, question count.
- Tick interval: 700 ms, so the wave is watchable. The Drex time for each tick is shown in the top bar.
- Modes: `warnings=off` (warnings are dropped) and `warnings=on`. Same seed. Every event is appended to `data/replays/sim-warn-{off,on}.jsonl`.

**Render** (PixiJS):
- One sprite per organism from a single pre-blurred circle texture, additive blend, tint per state. Slow drift with a per-organism phase. No filters per sprite.
- State cue is colour plus shape: healthy teal, exposed amber ring, infected dim red with a dashed outline, immune white halo.
- Warning: a short line pulse from sender to neighbor. Skip it under `prefers-reduced-motion`.
- Click: hit test, open the drawer for that organism's latest decision.
- Top bar: decisions made, median Drex ms, tick, mode, tag.
- Done when: both modes run end to end on real calls and the replay files exist.

## D6. Attack and upload (14:00, 30 min)

- `POST /api/attack {text}`: take a fixed base case (an S2 PDF), insert the judge's text as a note with PyMuPDF, save as a new file, run `parse_document` (live NDI, publish `parse_progress` events), then `decide` and `decide_llm` in parallel. Publish both decisions and an `organism_added` event. Open the drawer on it with the two results side by side.
- `POST /api/upload`: same path for an arbitrary file. Unsupported type or parse failure shows a clear "cannot read this file" state.
- Faster path if NDI is slow on stage: also offer "text only" mode, which puts the typed line straight into `notes` of the cached base case and skips NDI. Tag it "text injected after parsing".
- Done when: a typed line produces a new organism and two decisions in under 10 seconds.

## Freeze list (14:30)

- [ ] Fallback video recorded (full run, 3 minutes).
- [ ] Replay mode works with Wi-Fi off.
- [ ] No stub tag visible anywhere in the live path.
- [ ] `.env` not in the repository.
- [ ] One timed rehearsal done.
