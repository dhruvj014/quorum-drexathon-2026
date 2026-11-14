# Brief: forge (`backend/app/forge.py`)

Read first: `AGENTS.md`, `.plans/dataset-audit.md` section 2, `.plans/himanshu-build/02-case-builder.md` (steps 3 to 5 and Traps). No API keys needed. Do not touch other files under `backend/app/` except to add this one.

## Build

`backend/app/forge.py` using PyMuPDF and pyarrow:

- `list_sources(limit=None) -> list[dict]`: one-page Cobalt invoices from `dataset/data/invoice/test-00001.parquet` whose `words` contain the word `IBAN:`; fields `doc_id`, `number`, `total`, `currency`, `counterparty_name`, `iban` (from `extracted_data`). Sorted by `doc_id`. Read the `pdf` column only for rows you need.
- `load_pdf(doc_id) -> bytes`.
- `random_iban(seed: str, country="GB", length=22) -> str`: deterministic, printed in groups of four.
- `forge_iban(pdf_bytes, words_json, new_iban) -> bytes`: redact the IBAN tokens (the words right of `IBAN:` on the same line, page 0) with real redaction, then write `new_iban` on the same baseline in black Helvetica at matching size.
- `add_note(pdf_bytes, text, style="body") -> bytes`: write `text` into the largest free vertical gap in the lower half of page 0. `style="body"`: 9 pt black. `style="faint"`: 6 pt grey (0.6). Wrap long text; shrink to fit; never overlap existing words.
- `forge_invoice(doc_id, note: str | None, style="body", new_iban: str | None = None, out_path=None) -> dict`: applies both, saves the PDF under `backend/data/pdfs/`, returns `{path, doc_id, printed_iban, note}`. With `new_iban=None` and `note=None` it writes the untouched original.

Tests in `backend/tests/test_forge.py`: after `forge_iban`, `page.get_text()` contains the new IBAN and not the old one; `add_note` text is present in `get_text()`; output is one page; same inputs give identical printed IBAN.

Also write `backend/scripts/forge_demo.py` that writes four files for doc index 0: original, IBAN changed, changed + body note, changed + faint note, and renders each page 1 to PNG at 110 dpi next to it (for a human to look at).

## Done when
- `python -m pytest backend/tests/test_forge.py -q` passes.
- `python backend/scripts/forge_demo.py` writes 4 PDFs and 4 PNGs under `backend/data/pdfs/demo/`.
