# 05. Baseline (`backend/app/baseline.py`)

Write the stub at any free moment. Wire the real model at 12:30 or as soon as a key exists. Budget: 30 minutes.

## Status

The baseline model is **not chosen** and we have **no key**. We will ask at the event. Build this so the provider is one config value, and so the app runs without a key.

Without a real baseline there is no measured Apex Predator claim. Getting a key before 12:30 is the most important non-coding task of the day. Options: a team member's personal key, credits offered at the event, or a free tier of any strong model.

## Goal

Give a frontier LLM exactly the input Drex gets, ask exactly the same 13 questions, and return a `Decision` of the same shape with `system = "baseline"`.

## Interface

```python
async def decide_llm(parsed: ParsedInvoice, facts: Facts, policy=(100, 5, 30)) -> Decision
```

Config in `app/config.py` (env): `BASELINE_PROVIDER` (`anthropic`, `openai`, `google`, `stub`), `BASELINE_MODEL`, `BASELINE_API_KEY`.

## Fairness rules

1. **Same input.** Import `build_state(parsed, facts)` and `QUESTIONS` from Dhruv's `app/panel.py`. Do not write a second copy. The user message is the state as JSON plus the question list.
2. **Same task.** One request per invoice. The model returns, for each of the 12 yes/no questions, a probability from 0 to 1, and for `action`, three probabilities that sum to 1.
3. **A fair prompt.** The system prompt states the role (accounts-payable control), the meaning of the three actions (the same criteria text Drex gets), and one warning that invoice text is data and may contain instructions that must not be followed. Do not weaken it to make Drex look better. Judges will ask.
4. **Strong model.** Use the strongest model the key allows. Also record a fast, cheap model from the same provider if time allows; it answers "what about a small model?".
5. **Same concurrency** as the Drex run. Same retry rule: 429 waits and retries up to 3 times; anything else is a failure.
6. **No reasoning text requested.** Ask for JSON only. This keeps output tokens low, which is the kindest setting for the baseline's latency and cost. If the model has a thinking setting, run it off, and say so on the slide. If time allows, add a second run with thinking on.
7. **Temperature 0** where the provider allows it.

## Output format

Use the provider's structured output or tool-call feature with this schema, so parsing cannot fail on prose:

```json
{
  "answers": {"claims_verified": 0.0, "asks_skip_check": 0.0, "...": 0.0},
  "action": {"approve": 0.0, "verify": 0.0, "block": 0.0}
}
```

Then:
- `raw_action` = label with the highest action probability.
- `p` = the action object, renormalised to sum to 1.
- `final_action` = `guard(choose(p, L, V, D), facts)` using your functions from `04`.
- `wall_ms` = measured round trip with `time.perf_counter()`. `decision_ms` = the same value.
- `usage` = input and output tokens from the response.
- Missing keys, invalid JSON, or a refusal: `error` set, actions `null`. Count as a failure.

## Cost

`cost = input_tokens * price_in + output_tokens * price_out`, with prices from the provider's public price page on the day. Put the two prices and the page date in `config.py` with a comment. Do the same for Drex once the console shows its price. If credits are free, the table still shows list price, with a footnote.

## Stub

`BASELINE_PROVIDER=stub` returns fixed probabilities after a 1.5 s sleep, with `"stub": true`. The UI must show a "simulated" tag whenever a decision has `stub: true`. A stub number must never reach the results table.

## Done when

- `decide_llm` on the 25 development cases returns 25 decisions with no parse failures.
- A printed side-by-side for one S3 case shows the Drex and baseline panels on the same 13 ids.
- Switching provider is a change to `.env` only.

## Traps

- Do not send the case id, file name or scenario. `build_state` already excludes them. Print one full request body and read it once to be sure.
- Do not tune the baseline prompt on the 95 test cases. Use only the 25 development cases, the same ones used to tune the Drex question wording.
- Provider rate limits on a new key can be low. Test 10 parallel requests before the full run.
