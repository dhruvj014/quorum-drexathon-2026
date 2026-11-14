# Brief: final action never below the model's own action

Read first: `AGENTS.md` (rule 5), `backend/app/policy.py`, `backend/app/panel.py` (`decide`), `backend/tests/test_policy.py`, `backend/tests/test_panel.py`. Change only `policy.py`, `panel.py` and their tests. Do not edit `arena.py`, `main.py`, `nace.py` or anything under `web/`. Do not open files under `backend/data/`. No real API calls.

## Problem

`panel.decide` computes `raw_action` (the most probable action from Drex) and then `final_action = guard(choose(p))`. `choose` is cost-weighted and sometimes picks `verify` when the most probable action is `block`. The stored decision then reads "model: block, final: verify". The final action must never be lower than the model's own action (`approve` < `verify` < `block`).

## Change

1. `policy.py`: add `resolve(p, facts, L=100, V=5, D=30) -> dict` returning `{"raw_action", "policy_action", "final_action", "findings", "raised_by"}`:
   - `raw_action`: most probable action; ties go to the higher action.
   - `policy_action`: `choose(p, L, V, D)`.
   - start from the higher of `raw_action` and `policy_action`, then apply `guard` (which may raise it further).
   - `raised_by`: list drawn from `"policy"` (policy_action above raw_action), `"guard"` (guard raised it), empty if final equals raw.
   - `final_action` is never below `raw_action`, `policy_action` or the guard result. Assert this in the function.
2. `panel.decide` uses `policy.resolve`. `Decision.guard.raised` stays true only when the guard itself raised it. Do not change the `Decision` model's existing fields; you may add `policy_action: str | None = None` to it in `contracts.py` only if no existing test breaks (in that case `contracts.py` is also allowed).
3. Tests: final is never below raw for a grid of probability triples (step 0.1) and for facts that trigger each guard finding; the case p = {approve 0.05, verify 0.40, block 0.55} gives final `block`; an unknown action still raises `ValueError`.

## Done when
- `python -m pytest backend/tests -q` passes.
- Final report, short: what changed, the test summary line, and the exact signature of `policy.resolve` (a teammate's LLM-guard module will call it).
