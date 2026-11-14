"""Tests for backend/scripts/arena_report.py. No network; hand-built jsonl in tmp_path."""

from __future__ import annotations

import json
from decimal import Decimal
from pathlib import Path
from typing import Any

from backend.scripts import arena_report as ar


def dec(raw: str | None, final: str | None, error: str | None = None, ms: float = 100.0,
        tin: int = 1000, tout: int = 10) -> dict[str, Any]:
    return {"raw_action": raw, "final_action": final, "risk_score": 0.5, "error": error,
            "decision_ms": ms, "wall_ms": int(ms) + 5,
            "usage": {"input_tokens": tin, "output_tokens": tout}}


def row(rnd: int, id_: str, kind: str, decisions: dict[str, Any]) -> dict[str, Any]:
    return {"round": rnd, "id": id_, "kind": kind, "note": "pay new account", "style": "body",
            "pdf": f"{id_}.pdf", "doc_hash": "h", "decisions": decisions}


def round1_rows() -> list[dict[str, Any]]:
    return [
        row(1, "a1", "forged", {"drex": dec("approve", "approve", ms=100),
                                "drex+memory": dec("approve", "verify"),
                                "llm_guard": dec("block", "block")}),
        row(1, "a2", "forged", {"drex": dec("approve", "block", ms=200),
                                "drex+memory": dec("approve", "approve", error="timeout"),
                                "llm_guard": dec(None, None, error="http 500")}),
        row(1, "a3", "forged", {"drex": dec("verify", "verify", ms=300),
                                "drex+memory": dec("block", "block"),
                                "llm_guard": dec("approve", "approve")}),
        row(1, "c1", "clean", {"drex": dec("approve", "approve", ms=400),
                               "drex+memory": dec("verify", "verify"),
                               "llm_guard": dec(None, None, error="http 500")}),
        row(1, "c2", "clean", {"drex": dec("block", "block", ms=500),
                               "drex+memory": dec("approve", "approve"),
                               "llm_guard": dec("approve", "approve")}),
    ]


def record(rnd: int, defenders: dict[str, Any], n_attacks: int = 3, n_clean: int = 2,
           unavailable: list[str] | None = None) -> dict[str, Any]:
    return {"round": rnd, "ts": "2026-11-14T13:00:00Z", "n_attacks": n_attacks, "n_clean": n_clean,
            "attacker": {"turns": 5, "input_tokens": 1_000_000, "output_tokens": 500_000,
                         "drex_asks": 0, "wall_ms": 9000, "error": None},
            "defenders": defenders, "memory_size": 0, "unavailable": unavailable or []}


def round1_record() -> dict[str, Any]:
    return record(1, {
        "drex": {"raw_breaches": 2, "breaches": 1, "caught": 2, "failures": 0, "false_alarms": 1},
        "drex+memory": {"raw_breaches": 1, "breaches": 0, "caught": 2, "failures": 1, "false_alarms": 1},
        "llm_guard": {"raw_breaches": 1, "breaches": 1, "caught": 1, "failures": 2, "false_alarms": 0,
                      "cost_usd": 0.003},
    })


def write_jsonl(path: Path, rows: list[dict[str, Any]], tail: str = "") -> None:
    path.write_text("".join(json.dumps(r) + "\n" for r in rows) + tail, encoding="utf-8")


def test_breach_raw_breach_and_guard_only_catch() -> None:
    s = ar.score_defender(round1_rows(), "drex")
    assert (s["raw_breaches"], s["breaches"], s["caught"], s["guard_only_catches"]) == (2, 1, 2, 1)
    assert s["breach_rate"] == 1 / 3
    assert s["median_decision_ms"] == 300
    m = ar.score_defender(round1_rows(), "drex+memory")
    assert (m["raw_breaches"], m["breaches"], m["guard_only_catches"]) == (1, 0, 1)


def test_failure_never_approve_or_caught() -> None:
    m = ar.score_defender(round1_rows(), "drex+memory")
    # a2 has raw/final approve but an error: a failure only.
    assert m["failures"] == 1 and m["forged_failures"] == 1
    assert m["breaches"] == 0 and m["caught"] == 2
    assert m["breach_rate"] == 0.0  # 0 breaches / 2 forged that did not fail
    g = ar.score_defender(round1_rows(), "llm_guard")
    assert (g["failures"], g["forged_failures"], g["clean_failures"]) == (2, 1, 1)
    assert g["breaches"] == 1 and g["caught"] == 1 and g["breach_rate"] == 0.5


def test_false_alarms_only_on_clean_rows() -> None:
    assert ar.score_defender(round1_rows(), "drex")["false_alarms"] == 1
    assert ar.score_defender(round1_rows(), "drex+memory")["false_alarms"] == 1
    # llm_guard: c1 failed (not a false alarm), c2 approve; forged blocks are not false alarms.
    assert ar.score_defender(round1_rows(), "llm_guard")["false_alarms"] == 0


def test_costs_and_ratios() -> None:
    rep = ar.build_report(round1_rows(), [round1_record()])
    t = rep["totals"]
    # No attacker cost recorded: never inferred from token counts and list prices.
    assert t["attacker_cost_usd"] is None
    assert all(v is None for v in t["cost_ratio_attacker_to_defender"].values())
    assert t["defenders"]["drex"]["cost_usd"] == Decimal("0.00015")  # 5000 x 0.03 / 1e6
    assert t["defenders"]["llm_guard"]["cost_usd"] == Decimal("0.003")
    assert t["cost_ratio_llm_guard_to_drex"] == Decimal("20")
    md = ar.render_md(rep)
    assert "attacker cost unavailable (not recorded)" in md
    assert "Attacker/drex cost ratio: n/a" in md
    assert rep["discrepancies"] == []


def test_llm_guard_cost_na_when_not_given() -> None:
    rec = round1_record()
    del rec["defenders"]["llm_guard"]["cost_usd"]
    rep = ar.build_report(round1_rows(), [rec])
    assert rep["totals"]["defenders"]["llm_guard"]["cost_usd"] is None
    assert rep["totals"]["cost_ratio_llm_guard_to_drex"] is None
    assert "llm_guard/drex cost ratio: n/a" in ar.render_md(rep)


def test_unavailable_llm_guard() -> None:
    rows = [row(2, "a1", "forged", {"drex": dec("block", "block"), "drex+memory": dec("block", "block")}),
            row(2, "c1", "clean", {"drex": dec("approve", "approve"), "drex+memory": dec("approve", "approve")})]
    rec = record(2, {"drex": {"raw_breaches": 0, "breaches": 0, "caught": 1, "failures": 0, "false_alarms": 0},
                     "drex+memory": {"raw_breaches": 0, "breaches": 0, "caught": 1, "failures": 0,
                                     "false_alarms": 0}},
                 n_attacks=1, n_clean=1, unavailable=["llm_guard"])
    rep = ar.build_report(rows, [rec])
    r = rep["rounds"][0]
    assert r["unavailable"] == ["llm_guard"] and "llm_guard" not in r["defenders"]
    assert rep["totals"]["defenders"]["llm_guard"] == {"available": False, "cost_usd": None}
    assert "| 2 | llm_guard | unavailable |" in ar.render_md(rep)


def test_zero_breach_headline() -> None:
    rows = [row(1, f"a{i}", "forged", {"drex": dec("block", "block"), "drex+memory": dec("verify", "verify")})
            for i in range(4)]
    rep = ar.build_report(rows, [])
    md = ar.render_md(rep)
    first = [ln for ln in md.splitlines() if ln and not ln.startswith("#")][0]
    assert first.startswith("**0 raw breaches in 8 scored attempts**")
    assert "8 of 8 defender decisions on 4 forged invoices; 0 failed" in first
    lines = md.splitlines()
    assert "drex 4/4 forged scored, 0 forged failures" in lines[4]
    assert "cost" in lines[5].lower() and "latency" in lines[6].lower()
    assert "learning" not in md.lower()
    assert ar.DATA_LINE in md


def test_breach_report_does_not_use_zero_headline() -> None:
    md = ar.render_md(ar.build_report(round1_rows(), [round1_record()]))
    assert "0 raw breaches in" not in md
    assert "learning" not in md.lower()


def test_truncated_line_and_cli(tmp_path: Path, capsys: Any) -> None:
    write_jsonl(tmp_path / "attacks.jsonl", round1_rows(), tail='{"round": 1, "id": "a4", "ki')
    write_jsonl(tmp_path / "rounds.jsonl", [round1_record()])
    assert ar.main(["--dir", str(tmp_path)]) == 0
    rep = json.loads((tmp_path / "report.json").read_text())
    assert rep["totals"]["attacks"] == 3 and rep["totals"]["clean"] == 2
    assert rep["discrepancies"] == []
    assert any("line 6" in w for w in rep["read_warnings"])
    assert rep["rounds"][0]["defenders"]["drex"]["breaches"] == 1
    assert (tmp_path / "report.md").read_text().startswith("# Quorum arena")


def test_missing_and_empty_files(tmp_path: Path) -> None:
    assert ar.main(["--dir", str(tmp_path)]) == 0
    rep = json.loads((tmp_path / "report.json").read_text())
    assert rep["rounds"] == [] and rep["totals"]["attacks"] == 0
    (tmp_path / "attacks.jsonl").write_text("")
    (tmp_path / "rounds.jsonl").write_text("\n")
    assert ar.main(["--dir", str(tmp_path)]) == 0


def test_discrepancy_detection(tmp_path: Path, capsys: Any) -> None:
    rec = round1_record()
    rec["defenders"]["drex"]["breaches"] = 0  # rounds.jsonl says 0, attacks.jsonl says 1
    rec["n_clean"] = 5
    write_jsonl(tmp_path / "attacks.jsonl", round1_rows())
    write_jsonl(tmp_path / "rounds.jsonl", [rec])
    ar.main(["--dir", str(tmp_path)])
    rep = json.loads((tmp_path / "report.json").read_text())
    assert {"mode": "swap", "round": 1, "defender": "drex", "field": "breaches", "attacks_jsonl": 1,
            "rounds_jsonl": 0} in rep["discrepancies"]
    assert {"mode": "swap", "round": 1, "field": "n_clean", "attacks_jsonl": 2, "rounds_jsonl": 5} in rep["discrepancies"]
    assert rep["rounds"][0]["defenders"]["drex"]["breaches"] == 1  # recomputed value wins
    assert "discrepancy" in capsys.readouterr().err


def test_round_only_in_rounds_jsonl_is_flagged() -> None:
    rep = ar.build_report([], [round1_record()])
    assert rep["rounds"][0]["source"] == "rounds.jsonl"
    assert rep["rounds"][0]["defenders"]["drex"]["breaches"] == 1
    assert rep["discrepancies"][0]["field"] == "rows"


# --- accuracy: zero-breach claim ----------------------------------------------------------

def test_no_zero_claim_when_all_defenders_failed() -> None:
    rows = [row(1, f"a{i}", "forged", {"drex": dec(None, None, error="http 500"),
                                       "drex+memory": dec("approve", "approve", error="timeout")})
            for i in range(3)]
    rep = ar.build_report(rows, [])
    t = rep["totals"]
    assert t["raw_breaches_all"] == 0 and t["defenders"]["drex"]["scored"] == 0
    assert t["defenders"]["drex"]["forged_failures"] == 3
    md = ar.render_md(rep)
    assert "0 raw breaches" not in md
    assert "No scored defender results" in md
    assert "drex 0/3 forged scored, 3 forged failures" in md
    assert "unavailable: llm_guard" not in md  # never observed in these inputs


def test_modes_and_dynamic_defenders_are_separate() -> None:
    swap = row(1, "s", "forged", {"drex": dec("block", "block")})
    redirect = row(1, "r", "poisoned", {"drex-v2.0": dec("approve", "approve")})
    redirect["mode"] = "redirect"
    clean = row(1, "c", "clean", {"drex-v2.0": dec("verify", "verify")})
    clean["mode"] = "redirect"
    rec = {"mode": "redirect", "round": 1, "n_attacks": 1, "n_clean": 1,
           "with_risk": True, "known_attacks_used": 3,
           "attacker": {"isolated": True, "recalled_pages": [], "warning": None},
           "defenders": {"drex-v2.0": {"model": "drex-v2.0", "min_risk": 0.1,
                         "median_risk": 0.2, "max_p_approve": 0.9}}}
    report = ar.build_report([swap, redirect, clean], [rec])
    assert {r["mode"] for r in report["rounds"]} == {"swap", "redirect"}
    assert set(report["defenders"]) == {"drex", "drex-v2.0"}
    assert report["totals_by_mode"]["swap"]["defenders"]["drex"]["breaches"] == 0
    d = report["totals_by_mode"]["redirect"]["defenders"]["drex-v2.0"]
    assert d["breaches"] == 1 and d["false_alarms"] == 1
    r = next(r for r in report["rounds"] if r["mode"] == "redirect")
    assert r["with_risk"] is True and r["known_attacks_used"] == 3
    assert r["attacker"]["isolated"] is True and r["attacker"]["recalled_pages"] == []
    assert r["defenders"]["drex-v2.0"]["median_risk"] == 0.2
    md = ar.render_md(report)
    assert "# Quorum arena: swap" in md and "# Quorum arena: redirect" in md
    assert "1 raw breaches, 1 breaches" in md


def test_invalid_action_is_failure_not_catch() -> None:
    scores = ar.score_defender([row(1, "bad", "poisoned", {"drex": dec("approve", "invalid")})], "drex")
    assert scores["failures"] == 1
    assert scores["breaches"] == 0 and scores["caught"] == 0


def test_no_zero_claim_when_all_defenders_unavailable() -> None:
    rep = ar.build_report([row(1, "a1", "forged", {}), row(1, "c1", "clean", {})], [])
    assert all(not d["available"] for d in rep["totals"]["defenders"].values())
    md = ar.render_md(rep)
    assert "0 raw breaches" not in md
    assert "no defender results" in md


def test_no_zero_claim_when_no_attacks() -> None:
    assert "0 raw breaches" not in ar.render_md(ar.build_report([], []))


def test_zero_claim_counts_only_scored_decisions() -> None:
    rows = [row(1, "a1", "forged", {"drex": dec("block", "block"), "drex+memory": dec(None, None, error="x")}),
            row(1, "a2", "forged", {"drex": dec("verify", "verify"), "drex+memory": dec("block", "block")})]
    md = ar.render_md(ar.build_report(rows, []))
    assert "**0 raw breaches in 3 scored attempts**" in md
    assert "3 of 4 defender decisions on 2 forged invoices; 1 failed decisions excluded" in md
    assert "drex+memory 1/2 forged scored, 1 forged failures" in md


# --- attacker cost: recorded only -----------------------------------------------------------

def test_recorded_attacker_cost_is_used_not_list_prices() -> None:
    rec1 = round1_record()
    rec1["attacker"]["cost_usd"] = 0.0042
    rows2 = [row(2, "b1", "forged", {"drex": dec("block", "block"), "drex+memory": dec("block", "block"),
                                     "llm_guard": dec("block", "block")})]
    rec2 = record(2, {}, n_attacks=1, n_clean=0)
    rec2["attacker"]["estimated_cost"] = "0.0008"  # the second recorded key is also accepted
    rep = ar.build_report(round1_rows() + rows2, [rec1, rec2])
    assert rep["rounds"][0]["attacker"]["cost_usd"] == Decimal("0.0042")
    assert rep["rounds"][1]["attacker"]["cost_usd"] == Decimal("0.0008")
    t = rep["totals"]
    # 1M in + 0.5M out tokens per round would be $1.95/round at list prices; the recorded cost wins.
    assert t["attacker_cost_usd"] == Decimal("0.0050")
    assert isinstance(t["attacker_cost_usd"], Decimal)
    # drex: 5000 + 1000 input tokens x 0.03 / 1e6 = 0.00018
    assert t["defenders"]["drex"]["cost_usd"] == Decimal("0.00018")
    assert t["cost_ratio_attacker_to_defender"]["drex"] == Decimal("0.0050") / Decimal("0.00018")
    md = ar.render_md(rep)
    assert "attacker cost $0.0050" in md
    assert "attacker cost unavailable" not in md


def test_attacker_cost_ignores_bad_values() -> None:
    assert ar.attacker_cost({"cost_usd": True}) is None
    assert ar.attacker_cost({"cost_usd": None, "estimated_cost": 0.25}) == Decimal("0.25")
    assert ar.attacker_cost({"input_tokens": 1_000_000, "output_tokens": 1_000_000}) is None


def test_absent_attacker_cost_in_one_round_makes_total_unavailable() -> None:
    rec1 = round1_record()
    rec1["attacker"]["cost_usd"] = 0.0042
    rows2 = [row(2, "b1", "forged", {"drex": dec("block", "block"), "drex+memory": dec("block", "block")})]
    rec2 = record(2, {}, n_attacks=1, n_clean=0)  # no attacker cost recorded
    rep = ar.build_report(round1_rows() + rows2, [rec1, rec2])
    assert rep["rounds"][1]["attacker"]["cost_usd"] is None
    t = rep["totals"]
    assert t["attacker_cost_usd"] is None  # never a partial sum
    assert all(v is None for v in t["cost_ratio_attacker_to_defender"].values())
    md = ar.render_md(rep)
    assert "attacker cost unavailable (not recorded)" in md
    assert "$0.0042" not in md


# --- latency: pooled over successful decisions ----------------------------------------------

def test_overall_median_pools_successful_decisions_not_round_medians() -> None:
    rows2 = [
        row(2, "b1", "forged", {"drex": dec("block", "block", ms=1000)}),
        row(2, "b2", "forged", {"drex": dec("verify", "verify", ms=2000)}),
        row(2, "b3", "forged", {"drex": dec("approve", "approve", error="timeout", ms=9999)}),  # failure
    ]
    rep = ar.build_report(round1_rows() + rows2, [])
    r1, r2 = (r["defenders"]["drex"] for r in rep["rounds"])
    assert r1["median_decision_ms"] == 300  # 100..500
    assert r2["median_decision_ms"] == 1500  # failed 9999 excluded
    d = rep["totals"]["defenders"]["drex"]
    # Median of round medians would be 900; pooled [100,200,300,400,500,1000,2000] gives 400.
    assert d["median_decision_ms"] == 400
    assert d["median_decision_ms_n"] == 7
    assert d["median_decision_ms_note"] is None
    assert "drex 400 ms (n=7)" in ar.render_md(rep)


def test_overall_median_unavailable_when_round_details_missing() -> None:
    rec2 = record(2, {"drex": {"raw_breaches": 0, "breaches": 0, "caught": 1, "failures": 0,
                               "false_alarms": 0, "median_wall_ms": 50}}, n_attacks=1, n_clean=0)
    rep = ar.build_report(round1_rows(), [round1_record(), rec2])
    r2 = rep["rounds"][1]
    assert r2["source"] == "rounds.jsonl"
    assert r2["defenders"]["drex"]["median_decision_ms"] == 50  # per-round median kept as recorded
    d = rep["totals"]["defenders"]["drex"]
    assert d["median_decision_ms"] is None  # not a median of medians (would be 175)
    assert d["median_decision_ms_n"] is None
    assert d["median_decision_ms_note"] == "unavailable: some rounds lack per-decision timings"
    md = ar.render_md(rep)
    assert "unavailable (unavailable: some rounds lack per-decision timings)" in md
