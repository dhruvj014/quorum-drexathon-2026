# Notes on Himanshu's `nace-docs` Pack: What It Changes

Source: `.plans/from-himanshu/nace-docs/` (unpacked next to the zip). It holds a build guide by Himanshu (`NACE_AGENT_GUIDE.md`), a generated endpoint list (`ENDPOINTS.md`), the OpenAPI spec, and 194 raw docs pages captured today.

I read the guide in full and spot-checked the limits, pricing and workspace pages. Nothing has been run. Numbers below are from the docs or the guide, not measured.

## 1. Facts that fill gaps in our plan

| Topic | Fact | Source |
|---|---|---|
| Credits | Promo code `DREXATHON` gives $35; new accounts get $5. Total $40 | guide |
| Drex price | $0.03 per 1M input tokens, all three models. Output not billed | guide (raw page shows a placeholder) |
| Drex limits | Free: 120 requests/min, 8 in flight. Paid: 1,200 and 16 | guide (raw table is a placeholder) |
| Paid status | An account is "paid" only after a top-up, auto-pay, or a paid invoice. Promo credit probably does not count. **Plan for 8 in flight** | raw limits page |
| Drex options | Up to 255 options per `choice` or `score` on the Max models; 512 questions per request | guide |
| `noul` criteria | `criteria: {"true": "...", "false": "..."}` sets the boundary more strongly than the instruction text | guide |
| State format | A change in state format can move `noul` probabilities. Fix the format before tuning thresholds | guide |
| Images | Drex Max accepts up to 8 images in a top-level `images` array | guide |
| NDI chaining | Parse once, then pass `{"type": "parse_result", "job_id": ...}` to extract, classify and ground. The parse cost is charged once | guide |
| NDI limits | At most 50 unfinished document jobs. Creates 120/min free | guide |
| NDI price | Per 1,000 pages, low mode: parse $3.50, extract $12, classify $6.20, split $5. Ground $12 per 1,000 targets | guide |
| Search price | $0.10 per 1M input tokens and $0.50 per 1M output; example search $0.18. The raw page says "to be announced" and the OpenAPI spec says workspaces are "not billed yet" | guide against raw: **conflict, check the balance after the first search** |
| Navigate tools | `locate`, `read-file`, `run-sql`, `folder-metadata`, `catalog`. Free. Answer inline. 150 locates and 600 other calls per 10 minutes. HTTP or CLI only; the SDK has no methods for them | raw page |
| Catalog | Ingestion extracts fields from every document into one SQL table per document type (for example `invoice`). `catalog` and `run-sql` query them | raw page |
| SDK | `pip install nace-sdk`: `AsyncNaceClient`, `client.system_one`, `client.documents.upload/parse/extract`, `client.workspaces.create/ingest`, `client.search.automatic`, `client.jobs.wait`. Retries 429 and 5xx by itself | guide |
| CORS | `/v1` routes send no CORS headers. Backend only | guide |
| Submission | `nace.ai/drexathon/submit`, with an event code from an organizer | guide |
| Vendor benchmark | Median latency: Drex Max 172 ms, GPT-6 Sol about 2.0 s, Claude Opus 5.5 about 3.5 s. Cost per 1,000 decisions: $0.03, $3.33, $10.17. Vendor figures; label them so if quoted | guide |

## 2. One thing in the guide is wrong: Intern

The guide's section 11 says Intern is a Slack agent with no developer interface. The organizers' rule says "Intern, the Nace harness", and `github.com/nace-ai/intern` is an open-source command-line agent harness with Drex as its supervisor. The raw docs pages do not mention Intern at all, which is likely why the guide guessed. **Use `intern-setup.md`, not the guide's section 11.** The organizers' answer settles it either way.

The guide also lists only Adobe and DeepInfra as partner tools. The organizers' slide adds Keenable.

## 3. Changes to the plan

### 3.1 Use the SDK, not hand-written HTTP (Dhruv, saves time)
`nace.py` wraps `AsyncNaceClient`. It already retries and sends idempotency keys. Hand-written `httpx` is needed only for the navigate tools.

### 3.2 Supplier history: try the free catalog first (Himanshu, changes `07`)
After ingestion, check whether the `invoice` catalog table holds the IBAN:

```text
POST /v1/workspaces/{id}/tools/catalog      (see ENDPOINTS.md for the body)
POST /v1/workspaces/{id}/tools/run-sql      {"sql": "SELECT ... FROM invoice ..."}
```

- **If the IBAN is a column:** the supplier's historical IBANs, with document counts, come from one SQL query. It is free, exact, and not subject to the 60-per-10-minutes search limit. Per-invoice duplicate checks then become possible for all 95 benchmark cases.
- **If not:** keep the plan in `07` (one `automatic-search` per supplier) and use `locate` for per-invoice lookups on the live path. `locate` is free and allows 150 calls per 10 minutes.

Either way, still run one `automatic-search` per supplier for the drawer, because it returns quoted evidence with page numbers. That is the part people can see.

### 3.3 NDI: parse once, reuse (Dhruv, changes `intake.py`)
`upload -> parse -> extract(parse_result)`. On the live attack path add `classify(parse_result)` and `ground(parse_result)` at no extra parse cost. Keep at most 8 documents in flight; the cap is 50 unfinished jobs.

### 3.4 Question wording (Dhruv, changes `panel.py`)
Give each of the 12 `noul` questions a `criteria` object with `true` and `false` boundaries. Fix the `state` layout before the first tuning run and do not change it afterwards.

### 3.5 Benchmark: add a hybrid row (Himanshu, changes `06`, 15 minutes)
"Drex first, LLM only when Drex confidence is below a threshold." Report the share of cases Drex handled alone, and the blended cost and latency. It is computed from stored decisions, so it needs no new calls. It answers the question "why not use both?" before a judge asks.

### 3.6 Concurrency
Everything at 8 in flight: benchmark, pre-parse, initial dish decisions. The dish tick is one call, so it is unaffected. The baseline runs at 8 too.

### 3.7 Optional, only if ahead: Drex Max reads the page image
Send the rendered invoice page as an image with two `noul` questions ("Is there small or faint text near the footer?", "Does the bank block look altered?"). It shows the multimodal model on the same document. Not needed for the core story.

Not adopted from the guide: browser runs, batches (too slow for today), SQL warehouse integrations.

## 4. Budget check against $40 of Nace credit

| Item | Estimate |
|---|---|
| NDI extract, 230 pages, low mode | $2.80 |
| NDI classify and ground on the live path | under $0.50 |
| Drex: 95 x 2 benchmark runs + tuning + 300 dish ticks of 200 questions | under $1 at $0.03 per 1M tokens |
| Drex Search: 3 supplier searches + 20 live, at the guide's $0.18 each | about $4 |
| Ingestion of about 250 files | unknown ("to be announced" or not billed) |
| **Total** | **under $10, plus ingestion** |

The $40 is not a constraint. The LLM key for the baseline and for Intern is separate and still open.
