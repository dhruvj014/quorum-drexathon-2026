# Dataset Audit (2026-11-14): Plan Corrections

I opened every downloaded file and checked the plan against it. This file overrides earlier files where they differ. Dataset location: `d:\Coding\Drexathon\Quorum\dataset\data\` (add `dataset/` to `.gitignore`).

## 1. Nothing more to download

The files on disk cover the whole plan. Do not fetch the `scans/` images (16 GB) or the train split.

## 2. What the invoices really contain

| Supplier | Locale | One-page invoices with a printed bank block | Printed as | Distinct customers |
|---|---|---|---|---|
| Cobalt Wholesale Ltd | en, GBP | **315** (206 in `test-00001`, 109 in `test-00000`) | `IBAN: GB18 1790 8734 9062 1374 9599` | 83 in `test-00001`, 61 in `test-00000` (overlap not counted) |
| Ember Bikes SARL | fr, EUR | **107** (`test-00000`) | `IBAN: FR83 ...` | not counted for these 107; nearly one customer per invoice across Ember as a whole |
| Lumen Media Corp | en, USD | 15 (`test-00000`) | `Account: 9368807563` + routing number (no IBAN) | 13 |
| Delta Sound SA | fr, EUR | 0 found | not printed | - |
| Vantage Imports SAS | fr, EUR | 0 | bank block never printed | - |
| Union Sports SAS | fr, EUR | 0 | bank block never printed | - |

Corrections to what I wrote before:
- **"6 suppliers" was wrong.** Only Cobalt and Ember print an IBAN in useful numbers. Lumen is a small third with a US account and routing number.
- Most Ember invoices say "paid by card" and print no bank details, even where the `show_bank` option is true. **Do not filter on `show_bank` alone. Filter on the word `IBAN:` being present in the `words` column.**
- Vantage has 693 invoices in `test-00001`, none usable.

Checks that passed for Cobalt (all 315 rows):
- The `IBAN:` label is one word; the IBAN is the next 6 words on the same line. The redaction rectangle in `02-case-builder.md` works as written.
- Every page has a free vertical gap of at least 51 points in its lower half (median over 120). The S3 and S5 notes fit.
- Every invoice has a real note in the data, and it is printed on about 40% of them (for example "Keep chilled items at 0 to 4 C"). This is useful: harmless notes exist, so the model must tell a normal note from an attack. Do not remove them.
- Median invoice total: about GBP 2,500.

## 3. Changes to the plan

### Benchmark (unchanged in size)
24 Cobalt sources x 5 scenarios = 120 cases. All English. Take sources from `test-00001`.

### Dish (about 200 organisms)
- Two supplier nuclei: Cobalt and Ember. Optional third: Lumen (15 organisms).
- 120 Cobalt organisms + 80 Ember organisms, one per invoice. Cobalt has fewer distinct customers than that, so an organism is "one customer's open invoice", and a customer name can appear more than once. Ember gives French invoices in the dish for free; this is variety, not a second benchmark.
- Forged Ember cases for the contagion: forge 20 Ember invoices with the same builder (the label is also `IBAN:`). Check 3 by eye.

### Drex Search workspace
- `invoices/cobalt-wholesale-ltd/`: 150 Cobalt invoices with `IBAN:` printed, **excluding** the 24 benchmark sources and the dish originals. There are 315 Cobalt rows, so there is room: 24 + 120 + 150 = 294.
- `invoices/ember-bikes-sarl/`: the 107 minus the 80 used in the dish leaves only 27. Use those 27. It is thin but enough for one history search.
- `invoices/lumen-media-corp/`: skip unless Lumen is in the dish.
- Clutter folders (credit notes, purchase orders, quotes, statements): 25 each, optional.
- **Supplier history searches: 2 (Cobalt, Ember), or 3 with Lumen. Not 6.** The cross-check line becomes "2 of 2".

### Ember also has invoices with no bank block at all
1,790 one-page Ember invoices print no bank details. A handful in the dish are a free, real test of the "payment evidence missing" path: NDI should return `iban: not_found` and the guard should send them to `verify`. Add 10. Label them as their own scenario (`S0 no payment details`, expected `verify`) and keep them out of the 95-case table, or report them as a separate line.

### Three-way match
Confirmed dropped. Purchase orders exist only for Cobalt and Vantage and share no order ids with invoices (0 of 4,490). Goods received notes belong to Union Sports and Ember only.

### Lumen (optional, only if ahead of schedule)
A supplier paid by account and routing number shows the pipeline is not IBAN-only. It needs `account` and `routing` fields in the NDI schema and in `checks`. Skip by default.

## 4. Other document types on disk

| Type | Rows | Suppliers |
|---|---|---|
| purchase_order | 1,807 | Cobalt, Vantage |
| quote | 1,429 | Cobalt, Vantage |
| credit_note | 1,303 | Cobalt, Vantage |
| goods_received_note | 510 | Union Sports, Ember |
| account_statement | 107 | Ember, Union Sports, Vantage, Cobalt |

Use: workspace clutter, and one live NDI `classify` moment ("this upload is a purchase order, not an invoice"). Nothing else depends on them.
