# Build Plan (event day)

Companion to `build-spec.md`. Times are local. Build 11:00 to 15:00. Submission is hard at 15:00.

## 1. The one claim

"Same evidence, same questions: Drex decides in milliseconds at a fraction of the cost, and it holds up when the document tries to talk it into paying." Speed and cost lead. Robustness backs them. Every number on screen is measured by us.

## 2. Before 11:00 (no keys needed)

| Task | Owner |
|---|---|
| `pip install pymupdf fastapi uvicorn httpx pydantic nace-sdk`; `npm create vite` in `web/` | A |
| `build_cases.py`: filter `show_bank` + one page, write 24 x 5 PDFs, `cases.jsonl`, `trusted.json` | B |
| `contracts.py`, stub `nace.py` (`STUB=1`), `/ws` echoing fake ticks | A |
| Ask organizers: several tracks per project? pre-built code allowed? synthetic PDFs count for the NDI bonus? submission format? rate limits and credit caps? | either |

## 3. Timeline

| Time | A (pipeline + UI) | B (data + benchmark) | Gate |
|---|---|---|---|
| 11:00 | Keys in `.env`. One real Drex call. One real NDI extract. Fix auth host. Note measured latency and limits | Finish case builder. Check one forged PDF by eye | Both APIs answer |
| 11:20 | `intake.py` with disk cache; `panel.py` real call | `preparse.py`: all 120 case PDFs + 80 extra originals through NDI, 8 at a time | |
| 12:00 | Drawer UI: page image, polygons, bars, action chips | `checks.py`, `policy.py`, guard; run 25 dev cases; tune question wording; pick the Drex model | |
| **12:30** | **Checkpoint: one real invoice, NDI -> Drex, decision and evidence on screen** | | If missed: drop the dish contagion, keep a static dish |
| 12:30 | Dish: PixiJS organisms from real decisions, click opens drawer | `baseline.py` with real key; `run_bench.py` on 120 cases | |
| 13:15 | `sim.py` tick loop + contagion over WebSocket | Race endpoint + race tab counters; results table | Dish shows real decisions |
| 14:00 | Attack input + upload path; new organism appears | Record both sim runs to disk; replay mode; fix benchmark gaps | Contagion wave runs end to end |
| 14:30 | **Freeze.** Record the fallback video. Rehearse once with a timer | Slides (3 max), submission form | |
| 14:50 | Submit | | |

Rule: after 14:30 only bug fixes that a rehearsal exposed.

## 4. Cut order

1. Upload of arbitrary files (keep the typed attack line).
2. French invoices.
3. Policy slider.
4. Warnings-off comparison run (show only the immunity run).
5. Contagion (dish becomes a static field of real decisions).

Never cut: checkpoint slice, results table, typed live attack, fallback recording.

## 5. Demo script (5 minutes)

| Time | On screen | Line |
|---|---|---|
| 0:00 | Race tab running. Drex counter racing, baseline crawling | "Both are deciding the same invoices right now. Left is Drex." |
| 0:30 | Dish. Click one organism: invoice, highlight box on the IBAN, 12 bars | "Every dot is a real decision. NDI read the document. Drex answered these questions. No model wrote this explanation." |
| 1:15 | Infect one supplier, warnings off. Red spreads | "One supplier's bank details get swapped." |
| 1:45 | Reset, warnings on. Immunity wave | "Now agents warn their neighbors. One Drex call per tick decides for all of them." |
| 2:30 | Hand the keyboard to a judge. They type an attack line | "Try to talk it into paying." New organism appears, decision in ms, baseline answer beside it, whatever it is |
| 3:45 | Results table | Three numbers: speed ratio, cost ratio, unsafe approvals |
| 4:30 | Close | "Synthetic invoices, constructed scenarios, measured today." |

Fallback: if the network fails, switch to replay mode (tagged `replay` on screen). If the app fails, play the video.

## 6. Risks

| Risk | Response |
|---|---|
| NDI auth host differs from docs | First task at 11:00. Try `console.nace.ai` Bearer, then `ndi-api.nace.ai` with `X-API-Key` |
| NDI misreads the replaced IBAN | Check 5 forged PDFs by eye at 11:20. Use the same font size and black text. If `ambiguous`, the guard sends it to verify, which is correct behaviour |
| Drex rate limit lower than expected | Dish needs 1 call per tick. Benchmark runs at whatever concurrency the limit allows; baseline uses the same |
| 200 questions in one call is slow or weak | Test at 11:20 with 50, 200, 500 questions. Fall back to one call per supplier cluster |
| Drex is fooled by injection text | Report it. Show the "Drex + guard" row. Do not hide the "Drex alone" row |
| Drex is not more accurate than the baseline | Lead with speed and cost. Show accuracy per scenario honestly |
| No baseline key | Race cannot be real without it. Get one before 12:30 or the Apex claim is weak |
| PixiJS eats time | 200 circles with a glow filter and a tint per state. No custom shaders before 14:00 |
| Venue Wi-Fi | Everything cached on disk; phone hotspot ready |

## 7. Decided today

- Name: Quorum.
- Split: A is Dhruv (`dhruv-build.md`). B is Himanshu (`himanshu-build/`).
- Baseline: model not chosen, no key yet. Getting a key before 12:30 is the top non-coding task.

## 8. Still open

1. Baseline key: who asks the organizers and sponsors, and when.
2. Adobe: do we have Firefly or Express access today? If yes, use Firefly for the organism texture and Express for the 3 slides. If no, skip it.
3. Git remote and submission format (ask organizers).
4. Organizer answers: several tracks per project, pre-built code, synthetic PDFs and the NDI bonus, rate limits.
