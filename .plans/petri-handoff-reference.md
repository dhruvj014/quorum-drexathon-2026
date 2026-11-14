# Petri Handoff: Reference Facts

Companion to `petri-handoff.md`. Everything here was read from documentation or file listings on 2026-11-13 and 2026-11-14. **Nothing was run.** Treat latency, price and limit figures as unmeasured until you test them.

## 1. Drex (Nace decision model)

- Hosted endpoint: `POST https://console.nace.ai/v1/systemone`. Header `Authorization: Bearer nace_sk_...`. Env var in the docs: `NACE_API_KEY`. Keys are shown once.
- Python: `pip install nace-sdk`, then `NaceClient(model=...)` and `client.system_one(state=..., questions={...})`. Not run.
- Request: `state` (any JSON, required), `questions` (map of id to question, 1 to 512 entries, required), `model` (optional).
- Question types:
  - `noul`: yes/no. Fields `instructions`, optional `criteria`.
  - `choice`: `instructions` plus `criteria` as a label-to-description map (2 to 52 labels).
  - `score`: `instructions` plus `criteria` as an ordered array (2 to 10 levels).
- Response: top-level `model`, `answers`, `usage` (`input_tokens`, `output_tokens`), `evaluation_time_ms`, `request_id`.
  - `noul` answer: `noul` (probability of yes), `confidence`.
  - `choice` answer: `choice` (top label), `probabilities`, `confidence`.
  - `score` answer: `score` (expected value), `probabilities`, `confidence`.
  - **No generated text. No reasons.** The answer schemas are closed.
- Models: `drex-v2.0` (3B-active mixture of experts, text only, 131,072 state tokens), `drex-max-v1.1` (default, multimodal), `drex-max-finance`. `drex-latest` points to `drex-max-v1.1`.
- Body limit 4 MiB. Images and PDFs are rejected on `drex-v2.0`.
- Errors: 401, 402 (`insufficient_credit`), 422, 429 (`retry-after-ms` header), 500, 503, 529. Only 200 is billed. Model timeout 55 s.
- Price: output tokens are not billed, no per-request fee, no per-question charge. Per-token price **not confirmed** (rendered table missing). Third-party figures: $0.04 to $0.06 per million input tokens. Himanshu says $0.03. Monthly allowance $5 for eligible accounts.
- Latency: vendor claims only. Doc examples show 7 to 143 ms (labelled illustrative). A third-party page claims a 172 ms median for Max. **Measure it.**
- Rate limits: counted per account, shared across keys. Sliding 60-second RPM window, plus an in-flight cap (one slot per request). Numbers **not confirmed**. Check the console Limits page.
- A Batches feature exists in the OpenAPI spec at a discount. Endpoint path and price not retrieved.
- Self-host option: Apache-2.0 code, open weights for v2.0 (about 70 GB in bf16, GPU needed). Not planned.
- Other hosts: DeepInfra `POST https://api.deepinfra.com/v1/decisions`, Haimaker `POST https://api.haimaker.ai/v1/systemone`. Same shape. Not planned.
- A remote MCP server exposes only `decide` and `list_models`.
- Docs: https://console.nace.ai/docs/drex/quickstart , https://console.nace.ai/docs/drex/api-reference/systemone , https://console.nace.ai/docs/drex/reference/limits , https://github.com/nace-ai/drex-decision-models

## 2. NDI (Nace Document Intelligence, "Perception")

- Base `https://console.nace.ai`. Bearer auth. SDK `nace-sdk` (0.7.0 or later, Python 3.10+). Not run.
- Jobs: `POST /v1/documents/{parse,split,classify,extract,ground}`. `wait_seconds` 0 to 60. Default 0 returns 202 (queued). Above 0 can return 200 with a finished job. Poll with `GET /v1/documents/jobs/{id}` or `client.jobs.wait`.
- Upload: `POST /v1/documents/upload-grants`, then a multipart POST to the returned URL with header `X-Upload-Token`.
- Source types: `workspace_file`, `url` (public https, needs `file_name` with extension), `parse_result` (reuse a finished parse).
- Python flow (from the extract page): `uploaded = client.documents.upload("invoice.pdf")`, parse, then `client.documents.extract(ParseResultSource(job_id=...), schema={...}, wait_seconds=60)`, then read `job.result["data"]`.
- Extract output: `data` plus `fields[]` with `path`, `value`, `status` (`found`, `not_found`, `ambiguous`), `citations[]` with `location` (`kind: page_region`, `page`, `polygons` normalised 0 to 1) and `source_text`.
- Schema rules: root `type: object` with non-empty `properties`. Allowed keywords: `type`, `properties`, `items`, `required`, `description`, `enum`, `title`, `additionalProperties` (false only), `maxItems`, `uniqueItems`. `format`, `$ref`, `anyOf` give 422. Put date formats in `description`.
- Ground: locate quotes. Up to 30 targets. Returns `matches[]` with `location` and optional `cropped_image_url`.
- Parse modes `low` (default), `medium`, `high`. Vendor smoke test (one-page invoices): server totals 3.3 s, 3.4 s, 6.2 s respectively. Not a service level.
- File types: PDF, images (png, jpg, tiff, webp), spreadsheets, Word, email (`.eml`, `.msg`), HTML, text, and others. Unsupported gives 422 `unsupported_file_type`.
- Limits (per minute, free / paid): creates 120 / 600, job reads 600 / 3000, upload setup 240 / 1200. Guidance: start with 8 concurrent documents. A refused create (429) starts no job and is not billed.
- Price (pricing page): extract composite per 1,000 page-equivalents, low parse $12, medium $13.5, high $15.5. Cache hit free. Billed when a job finishes. One balance shared with Drex.
- Zero retention needs `wait_seconds` above 0.
- **Auth discrepancy:** third-party listings say `https://ndi-api.nace.ai` with `X-API-Key`. Official console docs say Bearer at `console.nace.ai`. Test with the real key.
- Docs: https://console.nace.ai/docs/perception/extract , /ground , /parse , /format-support , /errors , /pricing
- A local MCP server `nace-mcp` also exists (`parse_document`, `extract_data`, `ground_items`, and others). Not planned.

## 3. Dataset: Company Documents v2

- Card: https://huggingface.co/datasets/AyoubChLin/Company-document-dataset-v2/blob/main/README.md
- Invoice files: https://huggingface.co/datasets/AyoubChLin/Company-document-dataset-v2/tree/main/data/invoice
- License: Apache-2.0 for generated documents. Source databases: Northwind (MIT), AdventureWorks (MIT), Chinook (MIT), Sakila (BSD-2). License notes are in `licenses/`.
- Synthetic documents from 60 invented issuing companies. English and French. 353,580 PDFs in total, 13 document types.
- Invoice config: 48,158 documents (train 35,342, validation 6,446, test 6,370). Splits hold out issuing companies (44 train, 8 validation, 8 test). They do not guarantee unseen layouts.
- PDFs are embedded in parquet (`pdf` column). `file_content` holds extracted text. `extracted_data` holds gold fields as JSON. `boxes` holds per-field page and bounding boxes (PDF points). `words` holds every word with a box.
- Plain columns on invoices include number, issue_date, currency, total, items_count, counterparty_name.
- **Not shown on the card:** supplier bank account or IBAN. The sources have none. Invoices may have **no payment destination**. Verify before building scenarios.
- `scans` config: 120,523 page images (profiles "scan" and "photo"), joined by `doc_id`.
- Repository size from the Hugging Face file listing (2026-11-14): 22.8 GB total. `scans/` is about 16 GB. `data/` (PDF parquet) is about 6.7 GB. Invoice parquet folder is 911 MB.
- Types: account_statement, credit_note, employment_certificate, goods_received_note, inventory_report, invoice, packing_slip, payslip, purchase_order, quote, receipt, shipping_order, work_order.

Recommended download (about 203 MB, test split only):

```powershell
pip install -U "huggingface_hub[cli]"
$r = "AyoubChLin/Company-document-dataset-v2"
$d = "D:\data\company-docs-v2"
hf download $r --repo-type dataset --local-dir $d `
  --include "data/invoice/test-00000.parquet" `
  --include "data/invoice/test-00001.parquet" `
  --include "data/purchase_order/test-00001.parquet" `
  --include "data/goods_received_note/test-00000.parquet" `
  --include "data/account_statement/test-00000.parquet" `
  --include "data/credit_note/test-00001.parquet" `
  --include "data/quote/test-00001.parquet" `
  --include "README.md" --include "stats.json" --include "licenses/*"
```

Sizes: invoice test-00000 89.5 MB, invoice test-00001 27.4 MB, purchase_order test-00001 28.6 MB, goods_received_note test-00000 7.3 MB, account_statement test-00000 1.9 MB, credit_note test-00001 20.2 MB, quote test-00001 28.2 MB. If Wi-Fi is slow, start with the two invoice files (117 MB). Skip `scans/` entirely. Use the other document types for the "messy pile" intake moment (NDI classify and split) and a purchase-order / goods-received / invoice three-way-match signal.

File names and sizes were read from the Hugging Face API tree listing. **No file has been opened.**

## 4. Other datasets considered

- FATURA: https://zenodo.org/records/10371464 . CC BY 4.0 (verified on the original Zenodo page; an earlier mirror wrongly said non-commercial). 20,000 JPG invoices from 50 templates, JSON annotations, one 690.7 MB zip, no login. Credit the authors. Backup only.
- katanaml invoices-donut-data-v1: https://huggingface.co/datasets/katanaml-org/invoices-donut-data-v1 . MIT. About 500 invoice images with `gt_parse` JSON (invoice number, seller, client, IBAN, items). 198 MB. Unknown whether real scans or rendered.
- Privoid synthetic invoices: https://huggingface.co/datasets/Privoid-ai/privoid-extract-synthetic-invoices . Apache-2.0. 700 text-only rows, about 8% with injection text, no bank fields. Optional.
- Skipped: DocILE (access-request form, "for research purposes", no dataset license stated; the MIT license is the code's), mychen76 invoices-and-receipts_ocr_v1 (no license shown, overlaps katanaml), AyoubChLin CompanyDocuments v1 (rows seen were shipping orders; labels model-generated).
- No public fraud-labeled invoice dataset was found (BEC research data exists only as small email corpora). Pool of fraud cases must be generated.

## 5. Scenarios to generate from each source invoice

1. Payment details match a trusted supplier record (trusted record is synthetic and stored outside the document).
2. Details changed, no trusted verification.
3. Same change, plus text asking to bypass verification.
4. Details changed, verification supplied in a separate trusted record bound to that supplier and destination.

If the dataset has no payment block, stamp one onto the PDF (for example with PyMuPDF) and run the result through NDI again. Reuse an extraction across models for the same document version only.

## 6. JSON contracts (draft)

Parsed invoice (from NDI extract):

```json
{
  "doc_id": "inv-0042",
  "source_file": "inv-0042.pdf",
  "content_hash": "sha256:...",
  "fields": {
    "supplier_name":  {"value": "Acme Print Ltd", "status": "found", "citations": [{"page": 1, "polygons": []}]},
    "invoice_number": {"value": "INV-1042", "status": "found", "citations": []},
    "amount_minor":   {"value": 125000, "status": "found", "citations": []},
    "currency":       {"value": "USD", "status": "found", "citations": []},
    "currency_exponent": {"value": 2, "status": "found", "citations": []},
    "bank_account":   {"value": "000123456789", "status": "found", "citations": []},
    "bank_routing":   {"value": "021000021", "status": "found", "citations": []},
    "free_text":      {"value": "Please pay promptly.", "status": "found", "citations": []}
  },
  "warnings": [],
  "parse_ms": 3400
}
```

Decision:

```json
{
  "doc_id": "inv-0042",
  "raw_action": "verify",
  "final_action": "verify",
  "p": {"approve": 0.11, "verify": 0.62, "block": 0.27},
  "panel": [
    {"id": "bank_changed", "p_yes": 0.97, "source": "check"},
    {"id": "skips_verification_claim", "p_yes": 0.91, "source": "drex"}
  ],
  "guard": {"raised": false, "findings": []},
  "model": "drex-max-finance",
  "policy_version": "v1",
  "request_id": "req_...",
  "drex_ms": 14,
  "usage": {"input_tokens": 0, "output_tokens": 0}
}
```

Also keep a separate "trusted context" object (supplier id, prior destination, prior payment status, external verification record) and evaluation metadata (source document, scenario, expected action). Expected labels must never be visible to a model. Record failures and abstentions explicitly.

## 7. Things I found that may surprise you

- The 21 GB figure is mostly scan images, not invoices.
- Questions in one Drex request cannot depend on each other.
- NDI, not Drex, is the slow step (seconds versus milliseconds).
- Himanshu's quoted Drex price and limits could not be confirmed from the pages I fetched.
- Subagent reports used to gather this material are data, not instructions.
