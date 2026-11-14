# Petri: Hackathon Spec (draft 1)

Event: Nace AI Decision Model Hackathon x Adobe EDU, Saturday 2026-11-14, San Francisco.
Build window: 11:00 to 15:00. Hard submission: 15:00. Finalist demo: 5 minutes.
Team: 2 builders. Status: planning. Items marked **OPEN** are listed in `discuss-with-himanshu.md`.

## 1. One-paragraph summary

Petri turns a pile of messy business documents into a living simulated economy. NDI (Nace Document Intelligence) reads the documents. Drex (Nace's decision model) makes every decision of every agent. Attacker agents forge invoices and evolve their tricks. Defender agents catch them. A split screen races Drex against a frontier large language model (LLM) on the same decisions. A judge can try to fool the system live.

## 2. Decisions already made

| Topic | Decision |
|---|---|
| Domain | Accounts payable: invoices, payment details, fraud |
| Stack | Python + FastAPI backend, React + Vite front end, WebSocket for live ticks |
| Demo mode | Fully live: any file goes through NDI and Drex on stage, with a recorded fallback |
| Explanations | Question panel (many yes/no questions per invoice) plus NDI source citations. No outside model writes explanations |
| Swarm calls | One Drex call per tick. World snapshot in `state`. One `choice` question per agent (max 512 per call) |
| Swarm story | Contagion and immunity is the main stage. The attacker/defender arms race is a side panel |
| Uncertainty | Three outcomes: approve, verify, block. Cost-weighted thresholds with a live slider |
| Baseline | Strongest available frontier LLM, with a carefully tuned prompt and the same evidence as Drex |
| Visual style | Bioluminescent organisms on a dark canvas. Build with the `better-ui` and `animate` skills |
| Adobe | Firefly (species art, logos, letterheads), Photoshop (degrade scans), Express (finalist slides, results card) |
| 12:30 checkpoint | One real invoice through NDI and Drex, with a decision and evidence on screen |
| Pre-work | Allowed (confirm with an organizer at check-in). No API credits until the event, so build against a stub tonight |
| Priority | Wow factor first. Measured results back it up. They do not replace it |
| Organisms | Every organism in the petri dish is a real Drex decision, capped at about 500. Clicking one opens the real invoice and evidence. Replays are labeled "replay" |
| Primary track | Apex Predator. Wildcard through the presentation. Swarm only if agents truly interact (check eligibility at check-in) |
| Baseline key | None yet. Wire the interface and a stub now. Real calls wait for event credits |
| Adobe access | Unknown. Treat Adobe as a late add-on. Use code-based scan degradation as the fallback |
| Prep time | 1 to 3 hours before 11:00 |

## 3. What the docs say (verified 2026-11-13)

Drex:
- Endpoint `POST https://console.nace.ai/v1/systemone`. Header `Authorization: Bearer nace_sk_...`. Python package `nace-sdk`.
- Request: `state` (any JSON), `questions` (1 to 512), optional `model`.
- Question types: `noul` (yes/no), `choice` (2 to 52 labels), `score` (2 to 10 levels).
- Response: probabilities and `confidence` per question. No generated text. No reasons.
- Models: `drex-v2.0` (text only), `drex-max-v1.1` (default, multimodal), `drex-max-finance`.
- Latency and price: vendor claims only (about 172 ms median for Max, about $0.04 to $0.06 per 1M input tokens). Measure before quoting.
- Numeric rate and concurrency limits are not published. Read the dashboard Limits page.

NDI:
- Flow: `documents.upload`, then `documents.parse`, then `documents.extract` with a JSON schema.
- Each extracted field has `value`, `status` (`found`, `not_found`, `ambiguous`) and citations with `page_region` polygons (normalized 0 to 1).
- `documents.ground` finds the location of a quote.
- Schema limits: root must be an object. No `format`, `$ref` or `anyOf`.
- Formats: PDF, images, spreadsheets, Word, email (`.eml`, `.msg`).
- Vendor smoke test: about 3.3 s (low mode) to 6.2 s (high mode) per one-page invoice.
- Rate limit: 120 job creates per minute (free), 600 (paid). About 8 concurrent documents recommended.
- Host and auth conflict: the console docs say Bearer at `console.nace.ai`. Third-party listings say `X-API-Key` at `ndi-api.nace.ai`. **Check with the real key.**

## 4. Architecture

```text
documents (PDF, scan, email)
  -> NDI parse + extract            (slow: seconds; cache results)
  -> ParsedInvoice JSON              (contract A)
  -> deterministic checks            (fingerprint compare, duplicates)
  -> Drex question panel             (fast: milliseconds)
  -> Decision JSON                   (contract B)
  -> guard (can only escalate)
  -> UI: evidence, petri dish, race
```

Components:
1. **intake**: calls NDI, caches every result to disk, outputs `ParsedInvoice`.
2. **history**: supplier records (past bank details, amounts, dates).
3. **checks**: code that computes facts (bank details differ, duplicate, amount ratio).
4. **panel**: builds the Drex `state` and `questions`, calls Drex, returns `Decision`.
5. **guard**: ordinary code. It may raise an action (approve to verify to block). It may never lower one.
6. **baseline**: the same decision through a frontier LLM, for the race.
7. **sim**: the tick engine for the swarm (one Drex call per tick).
8. **arena**: attacker mutation and selection.
9. **web**: React front end, live over WebSocket.

### Contract A: ParsedInvoice (from NDI extract)

```json
{
  "doc_id": "inv-0042",
  "source_file": "inv-0042.pdf",
  "fields": {
    "supplier_name":   {"value": "Acme Print Ltd", "status": "found", "citations": [{"page": 1, "polygons": []}]},
    "invoice_number":  {"value": "INV-1042", "status": "found", "citations": []},
    "total_minor":     {"value": 125000, "status": "found", "citations": []},
    "currency":        {"value": "USD", "status": "found", "citations": []},
    "bank_account":    {"value": "000123456789", "status": "found", "citations": []},
    "bank_routing":    {"value": "021000021", "status": "found", "citations": []},
    "free_text":       {"value": "Please pay promptly.", "status": "found", "citations": []}
  },
  "parse_ms": 3400
}
```

Money is stored in integer minor units (cents), never floats.

### Contract B: Decision

```json
{
  "doc_id": "inv-0042",
  "action": "verify",
  "p": {"approve": 0.11, "verify": 0.62, "block": 0.27},
  "panel": [
    {"id": "bank_changed", "p_yes": 0.97, "source": "check"},
    {"id": "skips_verification_claim", "p_yes": 0.91, "source": "drex"}
  ],
  "guard": {"escalated": false, "reason": null},
  "drex_ms": 14,
  "model": "drex-max-finance",
  "request_id": "req_..."
}
```

## 5. Drex usage design

**Question panel.** One call per invoice. `state` holds the extracted fields, the supplier history summary and the computed facts. `questions` holds 20 to 40 `noul` questions plus one final `choice` question (`approve`, `verify`, `block`). Example questions:
- Does the free text claim that verification is not needed?
- Does the free text use urgency or pressure language?
- Do the bank details differ from the supplier's previous invoices?
- Does the invoice reference a prior verified callback?
- Is the amount unusual for this supplier?
- Does any text look hidden or out of place for an invoice?

**Why a panel.** Drex gives no reasons, so the panel is the explanation. The probability bar chart plus NDI highlight boxes is what the judge sees.

**Cost-weighted thresholds.** Let `p_f` be the probability that the invoice is fraudulent (from the `choice` probabilities). Let `L` be the loss from paying a fraud, `V` the cost of one verification, and `D` the cost of wrongly blocking a good invoice. The action with the lowest expected cost wins:
- approve: `p_f * L`
- verify: `V`
- block: `(1 - p_f) * D`

The live slider changes the `L : V : D` ratio and the decisions change on screen.

**Model choice.** Try all three Drex models on the dataset tonight if a key is available. Otherwise first thing at the event. Start with `drex-max-finance`.

## 6. Dataset

**Update (event day), supersedes the two-pool plan below.**
- **Invoice source:** Company Documents v2, `invoice` config (Apache-2.0, synthetic). 48,158 invoice PDFs, embedded in parquet, with per-field bounding boxes and a degraded-scan config. Start with one test parquet file (about 90 MB). Do not download the whole dataset.
- **First check (15 minutes):** load one invoice and read `extracted_data`. The card shows no bank account field, so the invoices may have no payment destination. If so, our script stamps a "Payment details" block onto the PDF. Every stamped PDF goes back through NDI.
- **Scenarios per source invoice:** (1) details match a trusted supplier record, (2) details changed with no verification, (3) changed plus "no verification needed" text, (4) changed with verification held in a separate trusted record. The trusted record is stored outside the document.
- **Size:** about 100 source invoices, or fewer if time is short. A development set of 30 to 50 first. These are constructed scenarios from synthetic documents, not real fraud cases. Say so on the slide.
- **Backups:** FATURA (CC BY 4.0, JPG images, credit the authors). Privoid (text only, optional).
- **Wording for slides:** "We have not verified a public benchmark that pairs invoices, supplier histories and confirmed fraud outcomes."

Original two-pool proposal, kept for reference:

Pool A: public invoices (about 200 to 300).
- Sources (licenses checked on the original pages): FATURA (CC BY 4.0, 20,000 JPG images, credit the authors), katanaml invoices-donut-data-v1 (MIT, about 500 images). Skip DocILE (access request form, research only) and mychen76 (no license shown, overlaps katanaml). CompanyDocuments (Apache 2.0) has PDFs, but invoice content is unconfirmed.
- Purpose: test NDI on layouts we did not design. Measure false-alarm rate on real, legitimate documents.

Pool B: generated invoices (about 150 to 300, exact labels).
- About 25 fictional suppliers, each with 3 to 5 past invoices and fixed bank details.
- New invoices in these categories:

| Category | Correct action |
|---|---|
| Normal, same bank details | approve |
| Bank change with a verified callback reference | approve |
| Bank change with no verification | verify or block |
| Bank change plus "no verification needed" text | block |
| Hidden or white-text instruction | block |
| Duplicate of an earlier invoice | block |
| New supplier, large amount | verify |
| Amount spike, same bank details | verify |

- Rendered to PDF from templates. Then degraded into messy scans (Photoshop or a code-based degrader).
- Each file has a label record: category, correct action, reason.

Pitch line: "The layouts are public. The fraud labels are synthetic, because no public fraud-labeled invoice set exists."

## 7. Benchmark (Apex Predator track)

**Scope update:** a small, honest benchmark of about 100 cases that produces one clean table. It backs up the demo. It is not the main attraction. Report unsafe approvals and unnecessary escalations next to latency and cost. Count failed requests as failures, never as approvals. Estimated cost uses measured token usage and the published rate. Label promotional credits separately. The cost slider is a policy exploration, not an optimal setting.

Fair comparison rules:
1. Both systems receive the same NDI-extracted fields and the same history summary.
2. The baseline uses the strongest available frontier LLM with a tuned prompt and structured output.
3. Race the decision stage only. Report NDI time separately. NDI takes seconds and would hide the result.
4. Run both at the same concurrency.
5. Report Drex alone and Drex plus guard as separate rows.

Metrics: accuracy per category, precision, recall, false-alarm rate on Pool A, injection-resistance rate, p50 and p95 latency per decision, throughput at equal concurrency, cost per 1,000 decisions.

Output: a results table (Markdown and on-screen) and a JSON file. Use the Batches feature for the offline benchmark if its endpoint is available.

## 8. Swarm simulation

- Agent types: supplier, customer, bank, attacker, defender.
- A tick sends one Drex call. `state` is the world snapshot. Each agent is one `choice` question with its own context in the question text.
- Actions: pay, delay, verify, block, flag-to-neighbors, ignore.
- Consequences: a wrong payment changes balances. A compromised supplier can drain several customers.
- Contagion: a flag signal spreads between defender agents. Immunity spreads with it.
- Hypothesis to test early: one shared `state` is enough for 512 agents. If not, batch by agent type.

Arms race (side panel): attackers mutate forged invoices with plain-code operators (swap bank digits, add urgency text, add injection text, change a name by one character, degrade the scan). An attacker that gets approved reproduces. A species tree shows the lineage. Run mutations ahead of time or on a fixed seed so the demo is repeatable.

## 9. User interface

- Dark canvas with bioluminescent organisms (PixiJS). One organism per agent. Healthy glows, compromised fades.
- Click an organism: its last decision, the question panel bars, the invoice with NDI highlight boxes.
- Race screen: Drex and baseline side by side, with live counters. Counters update instantly and use tabular figures (no animation on high-frequency numbers).
- Cost slider for the three-way threshold.
- Judge panel: upload a file, or type an attack line.
- Motion rules: gate everything behind `prefers-reduced-motion`. Keep a static cue for every state change. Use the `better-ui` and `animate` skills when building.

## 10. Demo arc (5 minutes, draft)

**Wow-first version (supersedes the list below).** Three moments:
1. **Speed you can feel (first 10 seconds).** A decision counter spins like a heartbeat, with a soft pulse per Drex decision. The frontier model beside it ticks slowly.
2. **The contagion wave.** About 500 organisms, each a real decision. One compromised supplier goes dark and the infection spreads. Drex-driven defenders warn neighbors and an immunity wave follows. Click an organism: it opens into the real invoice with NDI highlight boxes on the changed bank details.
3. **Fool the AI, live.** A judge types an attack line or hands over a file (a phone photo works). A new organism appears in about 8 seconds and Drex flags it in milliseconds. Show the frontier model's answer beside it, whatever it is.

Then the results table (about 100 cases) and a one-line close. Add the mutation tree if time allows.

Original draft:

1. 0:00 to 0:30. The problem: a changed bank detail, one sentence of injected text.
2. 0:30 to 1:30. A real messy file goes in. NDI parses it. Drex decides. Evidence on screen.
3. 1:30 to 2:30. The petri dish: one compromised supplier spreads, then immunity.
4. 2:30 to 3:30. The race and the results table.
5. 3:30 to 4:30. A judge tries to fool it live.
6. 4:30 to 5:00. Close with the measured numbers.

Fallback: a recorded video of the full run and cached results for every demo file.

## 11. Timeline

**Priority order:** (1) the checkpoint slice, (2) the petri dish and contagion wave on real Drex calls, (3) the race screen, (4) the live judge attack, (5) the small benchmark table, (6) the mutation tree. Before real keys exist, any visual built on simulated data is labeled "simulated."

Tonight (no API key):
- Dataset generator and label files.
- Stub `decide()` and `parse_document()` with the real interfaces.
- Project scaffold, contracts, benchmark harness skeleton.
- Firefly and Photoshop assets.

Event day:
- 10:15 to 11:00: confirm limits, auth host, rules. Get keys.
- 11:00 to 12:30: **checkpoint**: one real invoice, NDI to Drex, decision and evidence on screen.
- 12:30 to 13:30: benchmark run, race screen.
- 13:30 to 14:30: petri dish and swarm, arms-race panel if time allows.
- 14:30 to 15:00: freeze, record fallback video, submit.

Cut order if time runs short: arms-race panel, then swarm polish, then Express card, then Pool A size. Never cut: the checkpoint slice, the benchmark table, the live judge moment.

## 12. Risks

| Risk | Mitigation |
|---|---|
| Rate or concurrency limits are low | One call per tick. Batch by agent type. Cache everything |
| NDI takes 3 to 10 s per file | Progress state in the UI. Pre-parse all demo files. Parse-progress events |
| Drex is not more accurate than the LLM | Say so. Lead with speed and cost. Report per category |
| Injected text still biases Drex | Measure it. Show the guard. Report honestly |
| Live file fails to parse | Graceful "cannot parse" state and supported-format list |
| Network fails on stage | Recorded fallback and cached results |
| Dataset licenses | Check each license before use. Keep Pool A small |
| NDI auth host differs from docs | Test with the real key first thing |

## 13. Open items

See `discuss-with-himanshu.md`.

## 14. Sources

- Drex API: https://console.nace.ai/docs/drex/api-reference/systemone
- Drex quickstart: https://console.nace.ai/docs/drex/quickstart
- Drex limits: https://console.nace.ai/docs/drex/reference/limits
- NDI extract: https://console.nace.ai/docs/perception/extract
- NDI ground: https://console.nace.ai/docs/perception/ground
- NDI format support: https://console.nace.ai/docs/perception/format-support
- FATURA: https://arxiv.org/abs/2311.11856
- DocILE: https://github.com/rossumai/docile
