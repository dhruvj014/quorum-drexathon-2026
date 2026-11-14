# Organizer Update: What Changes (2026-11-14, kickoff)

This file overrides `build-spec.md`, `build-plan.md`, `dhruv-build.md` and `himanshu-build/` where they differ.

## 1. The new rules

1. Build with Intern, the Nace harness.
2. Extra credit for partner tools: Adobe, DeepInfra, Keenable.
3. No edits after the countdown ends.
4. Every team submits a presentation and code to the open-source library at nace.ai/drexathon.
5. Pick one track.
6. **Finalists are picked by usage of Drex, Intern, NDI and partner tools.**

Rule 6 changes the priority. To reach the stage we must show real, visible use of all four. The wow factor only matters after that.

## 2. What we learned about the tools (read from public pages today; nothing run)

**Intern** (`github.com/nace-ai/intern`, Apache-2.0, Python 3.12+)
- An agent harness with two models. "System 2" is an LLM that reasons and calls tools. "System 1" is Drex, which checks every turn (loops, risky tool calls, context size).
- Install: `uv tool install "intern-agent @ git+https://github.com/nace-ai/intern"`. Command: `intern`.
- Headless: `intern -p --json --system2 <model> -- "task"` prints one JSON event per line. Also `intern rpc` (JSON-RPC over stdio).
- System 2 needs an LLM key. **DeepInfra is a supported System 2 provider** (confirmed in `docs/usage.md`), as are OpenRouter, Fireworks, OpenAI and Anthropic. Setup steps are in `intern-setup.md`.
- Config files: `SYSTEM2.md`, `AGENTS.md`, `SYSTEM1.md` in `~/.intern/`.
- No Python library interface is documented. We run it as a subprocess.
- Optional capability `decision_files` scans PDFs, spreadsheets and images.

**DeepInfra**
- Hosts Drex: `POST https://api.deepinfra.com/v1/decisions`, Bearer token, models `nace-ai/drex-max`, `nace-ai/drex-max-finance`, `nace-ai/drex-v2.0`. Listed price $0.12 per 1M tokens for the Max models, $0.06 for v2.0.
- **Limit there: 64 questions per request** (the Nace console allows 512).
- Hosts large open LLMs behind an OpenAI-compatible endpoint, `https://api.deepinfra.com/v1/openai/chat/completions`. Listed prices per 1M tokens (input / output): `moonshotai/Kimi-K3` $2.85 / $14.25; `deepseek-ai/DeepSeek-V4-Pro` $1.30 / $2.60.

**Keenable**
- Web search and page fetch for agents. Keyless endpoint: `POST https://api.keenable.ai/v1/search/public` with header `X-Keenable-Title`, body `{"query": "...", "max_results": 3}`. Shared limit 1,000 requests per hour per IP. A free key gives 100,000 requests per month.

**Submission page**: behind a team login. Format not visible from outside. Ask an organizer.

## 3. Design changes

### 3.1 Intern becomes the "verify" investigator (new, Dhruv, 45 min, start 13:15)

When the final action is `verify`, an Intern agent does the verification work that a human clerk would do:

1. Reads the case facts (a JSON file we write for it).
2. Looks up the trusted record (a small CLI tool: `python -m app.tools.trusted <supplier_id>`).
3. Searches the web for the supplier and the bank named on the invoice with Keenable (`python -m app.tools.search "<query>"`).
4. Writes `investigation.json`: findings and a recommended action.

Drex supervises every turn as System 1. The backend starts `intern -p --json ...` as a subprocess, streams its events to the UI drawer as a live "investigation" log, and attaches the result to the organism. The investigation may raise the action. It may never lower it.

This gives real Intern use and real Keenable use, in one feature, and it is honest: the organisms that say `verify` now do something.

Fallback if Intern cannot run headless on Windows in 20 minutes: run it under WSL or Git Bash; if that also fails, use Intern as our coding harness for the build, record that, and say so plainly.

**Ask an organizer now:** does "build with Intern" mean Intern must run inside the product, or does building the project with it count?

### 3.2 DeepInfra: second baseline and second Drex host (Himanshu, inside `05`)

- Add `BASELINE_PROVIDER=deepinfra` (OpenAI-compatible). Run `moonshotai/Kimi-K3` or `deepseek-ai/DeepSeek-V4-Pro` as an open-model baseline. Cost for the whole benchmark is cents.
- The paid frontier model stays as the main "giant". The table then has two baseline rows: one closed frontier model, one large open model on DeepInfra.
- Optional: run the Drex benchmark through DeepInfra as well (13 questions fits under 64). The dish tick stays on the Nace console because of the 64-question cap.

### 3.3 NDI: use more of it

- Add `classify` on live uploads (is this an invoice?) and `ground` for the judge's attack text (show where the typed line landed on the page). Both are small calls on the path we already have.
- Keep the 200-document pre-parse.

### 3.4 Adobe (15 min, only after the 12:30 checkpoint)

Firefly for the organism texture or the title image; Express for the 3 slides. If nobody has access, skip it.

### 3.5 Usage panel (Dhruv, 15 min)

A small footer in the UI with live counters: Drex calls and questions answered, NDI documents and pages, Intern runs and turns, Keenable searches, DeepInfra calls. Judges pick finalists by usage, so make usage visible. Also write these totals to `data/usage.json` for the slide.

## 4. Track

Pick **Apex Predator** if a real baseline is running by 12:30 (frontier key or DeepInfra). Otherwise submit under **Swarm Intelligence**: the dish with neighbor warnings is a multi-agent system and needs no baseline. Decide at the 12:30 checkpoint, not later.

Note for Swarm: the rule text says Drex makes every agent's calls. In the dish tick, show `raw_action` from Drex and keep the guard out of the simulation.

### 4.1 Baseline key is uncertain: the ladder

We may buy a key, get one free, or have none. The code is the same in every case (`BASELINE_PROVIDER` in `.env`). Only the claim changes.

| What we have at 12:30 | Track | Claim on the slide |
|---|---|---|
| A closed frontier model key (bought or free) | Apex Predator | Drex against a named frontier model, plus the open-model row if DeepInfra works |
| Only DeepInfra credits | Apex Predator | Drex against a named large open model. Say "large open model", not "frontier" |
| No LLM key at all | Swarm Intelligence | No comparison. The race tab is hidden, not shown as simulated |

Rules:
- Nobody waits on the key. Himanshu builds `05` against the stub and switches provider when a key appears.
- The last moment to add a key is 13:30. After that the benchmark run and the replay recording cannot finish before the freeze.
- The same uncertainty applies to Intern's agent model (it needs an LLM key too). If there is no LLM key at all, Intern cannot run inside the product; use the fallback in 3.1.
- At check-in, ask whether the event gives DeepInfra or other LLM credits. A partner tool with "extra credit" often comes with free credits.

## 5. Submission

- Public repository with a license (Apache-2.0), a README (what it is, how to run, which Nace and partner tools are used and where), and no keys.
- The dataset now sits inside the project at `Quorum\dataset\` (about 190 MB). Add `dataset/` to `.gitignore` before the first commit, and link to the Hugging Face page in the README.
- Freeze at 14:30. Submit by 14:45. Nothing can be edited after the countdown.
- Create the repository and a first commit before 12:00 so the submission is never blocked by setup.

## 6. Frontier baseline budget ($10)

Per decision: about 1,200 input tokens (system prompt, state, 13 questions) and about 150 output tokens (JSON only, no reasoning text). Measure this on the first call.

`cost per decision = 1,200 x price_in + 150 x price_out` (prices per token, from the provider's price page today).

| Example list price (input / output per 1M) | Cost per decision | Decisions for $10 |
|---|---|---|
| $3 / $15 | about $0.006 | about 1,700 |
| $5 / $25 | about $0.010 | about 1,000 |
| $15 / $75 | about $0.029 | about 340 |

Planned calls: development tuning 25 x 3 = 75; reported benchmark 95; race 60 x 2 runs = 120; live attacks and tests 30. Total about 320.

So $10 is enough, with these rules:
1. Reasoning or thinking mode off, JSON output only. Thinking tokens are billed as output and can multiply the cost by 5 or more.
2. Tune the prompt on the DeepInfra model first; run the paid model only when the prompt is settled.
3. Rehearse the race from the replay file, not from live calls.
4. Set a spend limit on the key if the provider allows it. Log running cost after each batch.
5. Test for rate limits with 5 parallel calls before the full run. New keys often have low limits, and that is a bigger risk than the $10.
