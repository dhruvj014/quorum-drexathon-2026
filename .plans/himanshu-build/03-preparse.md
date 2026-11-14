# 03. Pre-parse (`backend/scripts/preparse.py`)

Start at about 11:20, after Dhruv confirms one real NDI extraction works. Needs the Nace key. Budget: 20 minutes of your time; the run itself goes on in the background.

## Goal

Send all 200 PDFs through NDI once, store every result on disk, and print how accurately NDI read them. After this, nothing in the demo waits for NDI except the live judge upload.

## What Dhruv gives you

`app/intake.py`:

```python
async def parse_document(path: str) -> ParsedInvoice
```

- It uploads the file, runs parse and extract, and maps the result to `ParsedInvoice`.
- It caches by content hash in `backend/data/ndi_cache/{sha256}.json`. A second call for the same file returns from disk and makes no API call.
- With `STUB=1` it returns a fake result marked `"stub": true`. Use this to write your script before the key works.

Do not call NDI directly. One client, one cache.

## Steps

1. List `backend/data/pdfs/*.pdf`. Order: the 25 development cases first, then the other 95 cases, then the 80 originals. The development cases unblock question tuning at 12:00.
2. Run with `asyncio.Semaphore(8)`. Vendor guidance is 8 documents at a time. The free limit is 120 job creates per minute. Each document makes 2 creates (parse, extract), so 8 at a time is safe.
3. On HTTP 429, read the `retry-after-ms` header, wait, and retry. At most 3 tries. On any other error, record it and continue.
4. Write `backend/data/preparse_report.json`: per file `ok`, `parse_ms`, `error`, and each field's `status`.
5. Score against `gold.jsonl` (from `02`) and print one small table:

| Field | Compare how |
|---|---|
| `iban` | remove spaces, upper-case, exact match |
| `invoice_number` | strip, exact match |
| `amount_minor` | equals `Decimal(total) * 100` |
| `currency` | exact match |
| `customer_name` | case-insensitive, whitespace collapsed |
| `notes` (S3, S5 only) | contains the first 6 words of the note we printed |

Also print: median and p95 `parse_ms`, count of failures, count of `ambiguous` or `not_found` IBANs.

## Expected cost and time

- Vendor smoke test: about 3.3 s per one-page invoice in low mode. 200 files at 8 in parallel is about 90 seconds if that holds. Measure; do not quote the vendor number.
- Price page: about $12 per 1,000 pages in low mode. 200 pages is about $2.40.

## Done when

- 200 files in `ndi_cache/`, or a list of the ones that failed and why.
- The accuracy table is printed and saved to `backend/data/ndi_accuracy.md`. This goes under the results table on the slide.
- Running the script again finishes in seconds with zero API calls.

## If results are poor

- **Forged IBAN read wrong or `ambiguous`:** look at the PDF. Usually the inserted text overlaps a remnant or the font is too small. Fix in `02`, rebuild, and re-run (changed files get new hashes; unchanged files stay cached).
- **S5 grey note not extracted:** raise the font to 7 points or darken the grey to 0.45. If still missed, try parse mode `medium` for S5 files only. Report the finding either way: "NDI did or did not read low-contrast text" is a real result.
- **`notes` comes back empty for S3:** tell Dhruv. The extract schema description for `notes` needs to say "all free text, remarks and instructions outside standard invoice fields."
