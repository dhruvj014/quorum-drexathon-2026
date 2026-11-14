# Arena results snapshot

Copied from backend/data/arena/ (git-ignored) so teammates can build reports from it.
Synthetic invoices. Attacks written by an LLM red-team agent. Not real fraud cases.

Files: rounds.jsonl (one line per round), attacks.jsonl (one line per invoice, with every
defender's decision), known_attacks.json (memory given to drex+memory).

Which rounds count:
- Rounds 1-10: mode swap (IBAN replaced). Valid.
- Round 11: redirect, 8 poisoned + 2 clean. Valid but a small check round.
- Rounds 12-17: redirect, 20 poisoned + 5 clean each. Valid.
- Rounds 18-21: every request failed (API refusing requests). Not run. Skip any round where
  every request failed; do not count those as caught or as approved.
- Later rounds (22 on): redirect, five defenders including llm_guard, added when this
  snapshot is refreshed.

Round lines before round 11 have no "mode" field: treat as swap.
