import asyncio
import json
from types import SimpleNamespace

import pytest
from pydantic import BaseModel

from backend.app import config, nace


class _M(BaseModel):
    type: str
    noul: float | None = None
    choice: str | None = None
    probabilities: dict[str, float] | None = None


class _U(BaseModel):
    input_tokens: int = 7
    output_tokens: int = 1


@pytest.fixture(autouse=True)
def _isolate(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "USAGE_FILE", tmp_path / "usage.json")
    monkeypatch.setattr(nace, "USAGE", {})


def test_bump_appends(tmp_path):
    nace.bump(drex_calls=1)
    nace.bump(drex_calls=2, ndi_jobs=0)
    nace.bump(ndi_jobs=0)  # no change, no line
    lines = (tmp_path / "usage.json").read_text().splitlines()
    assert len(lines) == 2
    assert json.loads(lines[-1])["drex_calls"] == 3


def test_drex_with_fake_client(monkeypatch):
    seen = {}

    async def system_one(state, questions, model=None):
        seen["questions"] = questions
        return SimpleNamespace(
            model=model, usage=_U(), evaluation_time_ms=55.0, request_id="req",
            answers={"a": _M(type="noul", noul=0.8),
                     "action": _M(type="choice", choice="verify",
                                  probabilities={"approve": 0.1, "verify": 0.8, "block": 0.1})},
        )

    monkeypatch.setattr(nace, "_client", SimpleNamespace(system_one=system_one))
    qs = {"a": {"type": "noul", "instructions": "x", "criteria": {"true": "t", "false": "f"}},
          "action": {"type": "choice", "instructions": "y",
                     "criteria": {"approve": "a", "verify": "v", "block": "b"}}}
    r = asyncio.run(nace.drex({"s": 1}, qs, model="m"))
    assert r["answers"]["a"]["noul"] == 0.8
    assert r["answers"]["action"]["choice"] == "verify"
    assert r["evaluation_time_ms"] == 55.0 and r["request_id"] == "req"
    assert r["usage"]["input_tokens"] == 7 and isinstance(r["wall_ms"], int)
    assert nace.USAGE["drex_calls"] == 1 and nace.USAGE["drex_questions"] == 2
    from nace_sdk import Choice, Noul
    assert isinstance(seen["questions"]["a"], Noul)
    assert isinstance(seen["questions"]["action"], Choice)


def test_drex_failure_raises_and_counts(monkeypatch):
    async def system_one(state, questions, model=None):
        raise RuntimeError("boom")

    monkeypatch.setattr(nace, "_client", SimpleNamespace(system_one=system_one))
    with pytest.raises(RuntimeError):
        asyncio.run(nace.drex({}, {}, model="m"))
    assert nace.USAGE["drex_calls"] == 1
