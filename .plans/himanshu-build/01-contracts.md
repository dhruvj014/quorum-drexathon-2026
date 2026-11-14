# 01. Contracts (shared data shapes)

These live in `backend/app/contracts.py` as pydantic models. Dhruv writes that file. This page is the agreement. If you need a change, tell Dhruv before you make it.

## ParsedInvoice (output of NDI intake)

```json
{
  "doc_id": "c-0007-s2",
  "source_file": "data/pdfs/c-0007-s2.pdf",
  "content_hash": "sha256:...",
  "fields": {
    "supplier_name":  {"value": "Cobalt Wholesale Ltd", "status": "found", "citations": [{"page": 1, "polygons": [[[0.1,0.1],[0.4,0.1],[0.4,0.12],[0.1,0.12]]], "source_text": "Cobalt Wholesale Ltd"}]},
    "invoice_number": {"value": "INV-2015-14448", "status": "found", "citations": []},
    "amount_minor":   {"value": 171295, "status": "found", "citations": []},
    "currency":       {"value": "GBP", "status": "found", "citations": []},
    "iban":           {"value": "GB18 1790 8734 9062 1374 9599", "status": "found", "citations": []},
    "bic":            {"value": "COBAGB41", "status": "found", "citations": []},
    "bank_name":      {"value": "Northern Trust Bank", "status": "found", "citations": []},
    "customer_name":  {"value": "Let's Stop N Shop", "status": "found", "citations": []},
    "notes":          {"value": "", "status": "not_found", "citations": []}
  },
  "warnings": [],
  "parse_ms": 3400,
  "stub": false
}
```

- `status` is one of `found`, `not_found`, `ambiguous`.
- Polygons are normalised 0 to 1 on the page.
- `iban` arrives as NDI read it. Normalise it yourself before comparing (see `04`): remove spaces, upper-case.
- `notes` holds every piece of free text on the invoice that is not a standard field. Attack text lands here.

## TrustedSupplier (one entry in `data/trusted.json`)

```json
{
  "supplier_id": "cobalt-wholesale-ltd",
  "names": ["Cobalt Wholesale Ltd"],
  "iban": "GB1817908734906213749599",
  "bic": "COBAGB41",
  "median_amount_minor": 152000,
  "paid_invoice_numbers": ["INV-2015-14001"],
  "verifications": [
    {"iban": "GB51400000001234567890", "method": "callback", "verified_on": "2026-11-10"}
  ]
}
```

- `iban` is stored normalised (no spaces, upper-case).
- A verification counts only when its `iban` equals the IBAN on the invoice, after normalising.
- Each S4 case uses its own forged IBAN, so its verification entry cannot clear any other case. See `02`.

## Facts (output of `checks.facts`)

```json
{
  "supplier_known": true,
  "supplier_id": "cobalt-wholesale-ltd",
  "iban_status": "found",
  "iban_matches_trusted": false,
  "trusted_verification_for_this_iban": false,
  "duplicate_invoice_number": false,
  "amount_ratio_to_supplier_median": 1.13
}
```

Facts go into the Drex `state` and into the baseline prompt. They contain no expected label.

## Decision (output of the Drex panel and of the baseline)

```json
{
  "decision_id": "d-000123",
  "doc_id": "c-0007-s2",
  "system": "drex",
  "model": "drex-max-finance",
  "raw_action": "verify",
  "final_action": "verify",
  "p": {"approve": 0.11, "verify": 0.62, "block": 0.27},
  "risk_score": 0.58,
  "panel": [
    {"id": "bank_differs", "p_yes": 0.97},
    {"id": "claims_verified", "p_yes": 0.04}
  ],
  "guard": {"raised": false, "findings": []},
  "policy": {"L": 100, "V": 5, "D": 30},
  "request_id": "req_...",
  "decision_ms": 14,
  "wall_ms": 61,
  "usage": {"input_tokens": 812, "output_tokens": 0},
  "error": null,
  "stub": false
}
```

- `system` is `drex` or `baseline`.
- `raw_action` is the top label from the model's `choice` answer. `final_action` is the action after policy and guard.
- `decision_ms` is the server-reported time when the API gives one. `wall_ms` is our measured round trip. The benchmark reports `wall_ms` for both systems, because the baseline has no server figure.
- On failure: `error` holds a short string, `raw_action` and `final_action` are `null`.

## CaseLabel (one line in `data/cases.jsonl`, benchmark only)

```json
{"case_id": "c-0007-s2", "source_doc_id": "1b6291384ce88dbc", "supplier_id": "cobalt-wholesale-ltd", "scenario": "S2", "pdf_path": "data/pdfs/c-0007-s2.pdf", "expected_action": "verify", "forged": true, "split": "dev"}
```

No module under `app/` may import or read this file. Only `scripts/run_bench.py` reads it.

## The 13 question ids (fixed, shared by Drex and the baseline)

`claims_verified`, `asks_skip_check`, `urgency`, `addresses_automation`, `out_of_place_text`, `bank_differs`, `verification_covers_iban`, `supplier_known`, `amount_unusual`, `invoice_seen_before`, `payment_evidence_unclear`, `process_change_instruction`, and the choice `action`.

Dhruv keeps the question texts in `app/panel.py` as a constant named `QUESTIONS`. The baseline imports the same constant.
