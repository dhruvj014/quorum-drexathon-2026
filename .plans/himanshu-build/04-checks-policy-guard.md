# 04. Checks, Policy, Guard (`backend/app/checks.py`, `backend/app/policy.py`)

Start at 11:00. Needs no API key. Budget: 40 minutes including tests. All of this is pure functions with no network calls.

## Where it sits

```text
ParsedInvoice -> checks.facts() -> Facts
Facts + ParsedInvoice -> Drex panel (Dhruv) -> p = {approve, verify, block}, raw_action
p -> policy.choose() -> policy action
policy action + Facts -> policy.guard() -> final_action
```

Dhruv's `panel.decide()` calls your three functions. The baseline (`05`) calls the same three, so both systems get identical treatment.

## `checks.py`

```python
def normalise_iban(s: str | None) -> str | None
def load_trusted(path="data/trusted.json") -> dict[str, TrustedSupplier]
def facts(parsed: ParsedInvoice, trusted: dict[str, TrustedSupplier]) -> Facts
```

Rules:

| Fact | Rule |
|---|---|
| `supplier_known`, `supplier_id` | Match `supplier_name` against each supplier's `names`: lower-case, strip punctuation, collapse spaces, exact match. No fuzzy match. A one-character name change must come out as unknown |
| `iban_status` | Copy the NDI status of the `iban` field |
| `iban_matches_trusted` | Supplier known, status `found`, and `normalise_iban(invoice) == trusted.iban`. Otherwise false |
| `trusted_verification_for_this_iban` | Supplier known, and some entry in `verifications` has the same normalised IBAN |
| `duplicate_invoice_number` | Invoice number is in `paid_invoice_numbers` for that supplier |
| `amount_ratio_to_supplier_median` | `amount_minor / median_amount_minor`, rounded to 2 places. `null` if either is missing |

`normalise_iban`: remove every character that is not a letter or digit, then upper-case. Return `None` for empty input. Do not correct look-alike characters (`O` and `0`). A look-alike swap is an attack and must show as a mismatch.

## `policy.py`

```python
ORDER = {"approve": 0, "verify": 1, "block": 2}

def risk_score(p: dict) -> float
def choose(p: dict, L: float = 100, V: float = 5, D: float = 30) -> str
def guard(action: str, facts: Facts) -> tuple[str, list[str]]
```

**`risk_score`**: `p["block"] + 0.5 * p["verify"]`. This is a working score. It is not a fraud probability and is not calibrated. On screen and on slides it is called "risk score".

**`choose`**: with `r = risk_score(p)`, expected costs are:

- approve: `r * L`
- verify: `V`
- block: `(1 - r) * D`

Return the action with the lowest cost. On a tie, return the stricter action. `L` is the loss from paying a fraud, `V` is the cost of one verification, `D` is the cost of wrongly blocking a good invoice. The UI slider changes `L`, `V`, `D` and calls `choose` again on stored probabilities. No new model call.

With the defaults: approve when `r < 0.05`; block when `r > 0.833`; verify between. Check these two thresholds in a test.

**`guard`**: raises only. Returns the new action and a list of finding codes.

| Condition | Minimum action | Finding code |
|---|---|---|
| `iban_status` is not `found` | verify | `iban_unreadable` |
| Supplier unknown | verify | `supplier_unknown` |
| IBAN does not match trusted and no trusted verification | verify | `unverified_bank_change` |
| `duplicate_invoice_number` | block | `duplicate_paid` |

Implementation: start from the input action; for each matching row take `max` by `ORDER`. The guard reads only `Facts`. It never reads invoice free text, so no text on a document can change what it does.

Note what the guard does not do: it does not block S3 or S5 by itself. It only forces them to at least `verify`. Getting from `verify` to `block` on bypass or injection text is Drex's job. That is the part of the benchmark that shows what the model adds.

## Tests (`backend/tests/test_policy.py`, pytest)

Write these first. They take 10 minutes and they protect the benchmark.

1. `normalise_iban("gb18 1790-8734 9062 1374 9599") == "GB1817908734906213749599"`.
2. Clean invoice: `iban_matches_trusted` true; guard leaves `approve` alone; findings empty.
3. Changed IBAN, no verification: guard raises `approve` to `verify` with `unverified_bank_change`.
4. Changed IBAN with a matching verification: guard leaves `approve` alone.
5. Verification for a different IBAN: does not count.
6. Guard never lowers: input `block` with clean facts returns `block`.
7. IBAN status `ambiguous`: at least `verify`.
8. Supplier name with one character changed: `supplier_known` false; at least `verify`.
9. `choose` thresholds at defaults: `r = 0.04` gives approve, `r = 0.06` gives verify, `r = 0.84` gives block.
10. `choose` with `p` that sums to 0.99 or 1.01 does not crash.

## Done when

- All tests pass with `pytest backend/tests`.
- Dhruv can import `facts`, `choose`, `guard`, `risk_score` and `load_trusted`.
- Running `facts` over the 25 cached development cases gives: S1 match true; S2, S3, S5 match false and verification false; S4 match false and verification true. If one row disagrees, the cause is NDI misreading the IBAN or the case builder. Find out which before going on.

## Reporting rows this produces

- **Drex alone**: `raw_action` (top label of the choice answer).
- **Drex + policy + guard**: `final_action`.
- **Baseline alone** and **Baseline + policy + guard**: the same two columns for the LLM. Showing the guard on both sides keeps the comparison fair.
