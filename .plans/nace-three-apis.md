# Using All Three Nace APIs (plan update)

Overrides earlier files where they differ. Read after `organizer-update.md`.

## 1. The three products and their job in Quorum

| Nace product | What it is | Its job in Quorum |
|---|---|---|
| **NDI / Perception** | Turns a document into machine-readable fields with page locations | Reads the incoming invoice |
| **Drex Search** (Workspaces) | Asks one question of many files and answers with quoted evidence | Finds what the company's own past paperwork says about this supplier |
| **Drex** | Decision model: probabilities for yes/no, choice and score questions | Decides approve, verify or block, and drives every organism in the dish |

One sentence for the pitch: **"NDI reads the invoice. Drex Search reads the filing cabinet. Drex decides."**

This is not forced. Until now the trusted supplier record was a JSON file we wrote by hand. That was the weakest part of the design: a judge can ask "where does the trusted IBAN come from?". With Drex Search the answer is "from 300 of the company's own past documents, and here are the quotes".

## 2. Drex Search facts (read from docs today; nothing run)

- Files live in a **workspace**. Upload with a `workspace_id`, then run **ingestion**. Only ingested files are searchable. Files uploaded for NDI alone are not in any workspace.
- Create: `POST /v1/workspaces` `{"name": "..."}`.
- Upload: `POST /v1/documents/upload-grants` `{"workspace_id": "...", "path": "invoices/x.pdf"}`, then POST the file to the returned URL with header `X-Upload-Token`.
- Ingest: `POST /v1/workspaces/{id}/ingestions?wait_seconds=60` `{"selection": {"type": "path_prefix", "path_prefix": ""}}`.
- Search: `POST /v1/workspaces/{id}/automatic-search?wait_seconds=60` with `query`, optional `mode` (`auto`, `fact`, `agent`), `path_prefix`, `paths`, `top_k` (1 to 50), `context`, `output_schema` (root object).
- Answer: `output.answer`, `output.confidence`, `output.evidences[]` with `source_path`, `source_file_id`, `page`, `quote`, `relevance`. With `output_schema`, read `structured_answer`.
- Evidence has a page number but no bounding box. For a box, call NDI `ground` with the `source_file_id`.
- **Rate limit: 60 searches per account per 10 minutes.** This shapes the design.
- Workspace files can also be used as NDI sources (`workspace_file`). So one upload serves both products.
- Auth: Bearer, same key and same balance as Drex and NDI.
- Unknown: search price (the page did not render it), ingestion price ("to be announced"), ingestion time. Up to $1 of credit is reserved while a search runs. Check the balance after the first search.

## 3. Design

### 3.1 The filing cabinet (workspace `quorum-ledger`)

About 300 files from the dataset we already have, all untouched originals:

| Path prefix | Content | Count |
|---|---|---|
| `invoices/{supplier}/` | Past invoices with a printed bank block. Never the 24 benchmark sources or their forged variants | about 150 |
| `purchase_orders/` | From `purchase_order/test-00001.parquet` | about 50 |
| `goods_received/` | From `goods_received_note/test-00000.parquet` | about 50 |
| `statements/`, `credit_notes/` | From the matching parquet files | about 50 |

No forged document and no label file ever enters the workspace.

### 3.2 Use A: supplier record from evidence (core, cached)

One search per supplier, run once and stored:

- Query: "Which bank account (IBAN and BIC) does {supplier name} ask to be paid into on its past invoices? List every distinct IBAN."
- `path_prefix`: `invoices/`. `mode`: `agent`. `top_k` not needed.
- `output_schema`: `{ibans: [{iban, bic, bank_name, documents_seen}]}`.
- Store in `data/history/{supplier_id}.json`: the structured answer, the evidences, the job id, the wall time.

`checks.facts` then reads the trusted IBAN from this file instead of from a hand-written value. The gold IBAN from the dataset stays in `gold.jsonl` only as a cross-check: report "Search found the correct historical IBAN for N of N suppliers".

With 6 suppliers this is 6 searches. The rate limit is not a problem.

The trusted **verification** records (scenario S4) stay in `trusted.json`. A callback record is not a document in the filing cabinet, and we should not pretend it is.

### 3.3 Use B: per-invoice lookup (live path only)

Because of the 60-per-10-minutes limit, per-invoice searches do not run in the 95-case benchmark or in dish ticks. They run when one invoice is in focus:

- The judge's live attack or upload.
- The Intern investigator on a `verify` decision (it gets a tool: `python -m app.tools.history "<question>"`).
- Opening the drawer on an organism (button "Search history", not automatic).

One fixed question, `mode: fact`: "Has invoice number {n} from {supplier} appeared before, and which bank account did earlier invoices to {customer} use?" (duplicate check plus customer-level history).

**Three-way match is dropped.** I checked the data: purchase orders and goods received notes share no order ids with the invoices (0 of 4,490), and they belong to a different party role. A "matching purchase order" search would find nothing real. The other document types stay in the workspace only as realistic clutter, which shows Search picking the right files out of a mixed pile.

### 3.4 What the drawer shows

Three stacked bands, one per product, each with its own measured time:

1. **NDI read this document**: page image, highlight boxes, fields.
2. **Drex Search found this history**: "12 past invoices show IBAN GB18 ... 9599" with two or three quotes, each with file name and page. A mismatch with the invoice's IBAN is shown side by side.
3. **Drex decided**: 12 bars, action, guard findings.

This is the moment that should make the founders proud: all three products, in order, on one screen, on one invoice, each visibly doing its own job.

### 3.5 State and fairness

- `build_state` gains a `history` block: the IBANs found, how many documents showed each, and the search confidence. No file paths.
- The baseline LLM receives the same `history` block. The comparison stays "same evidence, same questions".
- The guard still reads only `Facts`.

## 4. Work and time

| Item | Owner | Time | When |
|---|---|---|---|
| Build the workspace file set; create, upload, ingest | Himanshu (`himanshu-build/07-drex-search.md`) | 25 min + background ingestion | 11:20, alongside pre-parse |
| Use A: per-supplier search, cache, cross-check, wire into `checks` | Himanshu | 25 min | after ingestion |
| `nace.search()` client function and `history` block in `build_state` | Dhruv | 15 min | with D3 |
| Drawer band 2 | Dhruv | 15 min | with D4 |
| Use B: history tool + "Search history" button | Dhruv | 20 min | 14:00, only if the checkpoint was met on time |

Total added: about 100 minutes across two people. To pay for it:
- Arbitrary file upload is cut. The typed attack line stays.
- Keenable becomes optional. Web search is a weak fit for invented suppliers; use it only if the Intern investigator is running and there are 15 spare minutes.
- French invoices are cut.

## 5. Fallbacks

| Problem | Response |
|---|---|
| Ingestion is slow or fails | Shrink the workspace to invoices only (150 files). If still failing by 12:15, `checks` reads the IBAN from `trusted.json` as before, and we do not claim Search |
| Search returns the wrong IBAN | Report the cross-check number honestly. Try `mode: agent` and a narrower `path_prefix`. If it is still wrong for a supplier, use `trusted.json` for that supplier and say so on the slide. A wrong trusted IBAN would make every check for that supplier wrong, so never ship an unchecked Search result |
| Search is expensive | It runs 6 times for Use A. Live path is a handful more. Cap live searches at 20 for the day |
| Rate limit hit on stage | Cached Use A results still show in the drawer. The button shows "limit reached", not a spinner |

## 6. Updated never-cut list

Checkpoint slice (now: NDI read, Search history, Drex decision on one invoice), results table, typed live attack, fallback recording.
