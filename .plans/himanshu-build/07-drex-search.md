# 07. Drex Search: the Filing Cabinet (`scripts/build_workspace.py`, `scripts/supplier_history.py`)

Start at 11:20, next to the pre-parse. Needs the Nace key. Budget: 50 minutes of your time. Background and reasons are in `../nace-three-apis.md`.

## Why

Nace has three products: NDI (reads a document), Drex Search (answers a question from many files, with quotes), and Drex (decides). We want all three doing real work. Drex Search replaces the weakest part of our design: the trusted supplier IBAN was a value we typed into a JSON file. Now it comes from the supplier's own past invoices, with quoted evidence.

## Part 1: build the workspace (`build_workspace.py`)

1. Select files from the parquet data (same reading code as `02`):

| Workspace path | Source | Filter | Count |
|---|---|---|---|
| `invoices/{company}/{doc_id}.pdf` | `invoice/test-00000.parquet` and `test-00001.parquet` | `show_bank` true; not one of the 24 benchmark sources; spread across all 6 companies | 150 (25 per company) |
| `purchase_orders/{doc_id}.pdf` | `purchase_order/test-00001.parquet` | first 50 | 50 |
| `goods_received/{doc_id}.pdf` | `goods_received_note/test-00000.parquet` | first 50 | 50 |
| `statements/{doc_id}.pdf` | `account_statement/test-00000.parquet` | first 25 | 25 |
| `credit_notes/{doc_id}.pdf` | `credit_note/test-00001.parquet` | first 25 | 25 |

Only untouched originals. **No forged PDF, no `cases.jsonl`, no `gold.jsonl`, no `trusted.json` goes into the workspace.**

2. Create the workspace: `POST https://console.nace.ai/v1/workspaces` with `{"name": "quorum-ledger"}`. Header `Authorization: Bearer $NACE_API_KEY`. Save the returned id in `data/workspace.json`.
3. Upload each file: `POST /v1/documents/upload-grants` with `{"workspace_id": "...", "path": "invoices/cobalt-wholesale-ltd/abc.pdf"}`. Then POST the file as multipart (`file`, `metadata`) to the returned `upload_url` with header `X-Upload-Token`. Run 8 at a time. The upload-setup limit is 240 per minute on the free tier.
4. Ingest: `POST /v1/workspaces/{id}/ingestions?wait_seconds=60` with `{"selection": {"type": "path_prefix", "path_prefix": ""}}`. If it returns 202, poll `GET /v1/documents/jobs/{job_id}`.
5. Check: `GET /v1/workspaces/{id}/stats` or `/files`. Count files with `ingestion_status` equal to `ingested`. Print the count and the time ingestion took.

Start with the 150 invoices only. Add the other folders after the first search works. Ingestion price is not published, so read the balance before and after the first 150 and tell Dhruv.

## Part 2: supplier history (`supplier_history.py`)

For each of the 6 suppliers, one search:

```json
POST /v1/workspaces/{id}/automatic-search?wait_seconds=60
{
  "query": "Which bank account (IBAN and BIC) does Cobalt Wholesale Ltd ask to be paid into on its past invoices? List every distinct IBAN.",
  "path_prefix": "invoices/",
  "mode": "agent",
  "output_schema": {
    "type": "object",
    "properties": {
      "ibans": {"type": "array", "items": {"type": "object", "properties": {
        "iban": {"type": "string"}, "bic": {"type": "string"},
        "bank_name": {"type": "string"}, "documents_seen": {"type": "integer"}
      }}}
    }
  }
}
```

- With `output_schema`, read `structured_answer`, not `answer`. Evidence is in `evidences[]`: `source_path`, `source_file_id`, `page`, `quote`, `relevance`.
- If `agent` mode is slow, try `fact` with `top_k: 20`.
- Save to `data/history/{supplier_id}.json`: the query, mode, structured answer, evidences, confidence, job id, wall time in ms.
- **Rate limit: 60 searches per 10 minutes for the whole account.** Dhruv's live path shares it. Do not loop searches over cases.

Cross-check, printed and saved to `data/history/crosscheck.md`: for each supplier, does the top IBAN (normalised) equal the gold IBAN from `extracted_data`? Report "N of 6 correct". If a supplier is wrong, do not use its Search result; keep the `trusted.json` value for it and note that.

## Part 3: wire into `checks.py`

`load_trusted` merges two sources:
- `iban`, `bic`: from `data/history/{supplier_id}.json` when the cross-check passed, else from `trusted.json`. Add a field `iban_source`: `search` or `manual`.
- `verifications`, `median_amount_minor`, `paid_invoice_numbers`: from `trusted.json` as before.

Add to `Facts`: `history_documents_seen` (integer) and `history_distinct_ibans` (integer). Tell Dhruv, because `build_state` and the drawer use them. The baseline gets the same values through `build_state`.

## Note: no three-way match

Already checked: purchase orders and goods received notes share no order ids with the invoices (0 of 4,490). Do not build a purchase-order match. Those folders are in the workspace only as clutter, to show Search finding the right invoices in a mixed pile. If time is short, upload invoices only.

## Done when

- `data/workspace.json` exists and at least 150 files are `ingested`.
- `data/history/` has 6 files and the cross-check is printed.
- `facts()` on a cached S2 case shows `iban_matches_trusted: false` with `iban_source: search`.
- You told Dhruv: ingestion time, one search's wall time, and what the balance moved by.

## Stop rule

If ingestion has not finished or the first search has not worked by **12:15**, stop. `checks` keeps reading `trusted.json`. We then do not claim Drex Search in the pitch. Go to `05` and `06`.
