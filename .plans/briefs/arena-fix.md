# Brief: arena follow-up (attacker turn limit, IBAN placeholder, risk stats, fresh start)

Read first: `AGENTS.md`, `.plans/briefs/arena.md`, then `backend/app/arena.py`, `backend/scripts/run_arena.py`, `intern/prompts/redteam.md`, `backend/tests/test_arena.py`. Change only these four files. Do not edit `main.py`, `hub.py` or anything under `web/`.

Findings from the first real round: the attacker used 13 turns and 148k input tokens to write 6 notes and exited with code 1 at its turn limit; every note invented its own account number, different from the IBAN the forge prints; all 6 attacks got `verify` (risk 0.53 to 0.65), so the breach count alone shows nothing.

## Changes

1. **Attacker prompt** (`redteam.md`): tell it to read `feedback.json` once, write `attacks.jsonl` in a single write, then stop: no checking, no re-reading, no other files. Tell it the new account number is already printed in the bank details of the invoice; a note must not contain any account number, sort code or IBAN. If a note needs to refer to it, write the literal token `{IBAN}`. Explain the feedback fields, including `risk` when present (lower risk = closer to approval; aim to lower it).
2. **`arena.py`**:
   - Replace the token `{IBAN}` in each note with the forged IBAN for that invoice before printing it. Building the prompt must not break on that token (do not use `str.format` on text that contains it; replace `{n}` and `{round}` only).
   - Attacker max turns 20 (env `ARENA_ATTACKER_TURNS`). A non-zero exit code with at least one usable note is not an error: store it as `attacker.warning`, keep `attacker.error` for zero usable notes or a timeout.
   - Per defender scores, add over forged invoices with a decision: `min_risk`, `median_risk`, `max_p_approve` (3 decimals; `None` if no decisions).
   - Round record: add `with_risk` (bool) and `known_attacks_used` (memory size given to `drex+memory` in this round).
3. **`run_arena.py`**: add `--fresh`: before starting, if `backend/data/arena/` holds `attacks.jsonl` or `rounds.jsonl`, move the whole folder's contents except `trusted.json` into `backend/data/arena-archive/<UTC timestamp>/` (move, never delete). Print the extra columns: min risk for `drex` and `drex+memory`.
4. **Tests**: cover the `{IBAN}` replacement, the warning-versus-error rule, the new score fields, and `--fresh` moving files (on a temporary folder).

## Done when
- `python -m pytest backend/tests/test_arena.py -q` passes (run only this file; another agent is working in the repo).
- One real round: `python backend/scripts/run_arena.py --fresh --rounds 1 --attacks 6 --clean 2 --risk-feedback`. Budget: 1 attacker run, 20 NDI jobs, 20 Drex calls.
- Final report, short: test summary line, attacker turns and tokens and whether it stopped by itself, the 6 notes (first 100 characters) with raw action, final action and risk, and whether the faint-style note text appears in the NDI `notes` field of its parsed invoice (look in `backend/data/ndi_cache/`).
