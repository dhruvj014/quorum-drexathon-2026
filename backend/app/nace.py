"""Thin async wrapper over nace-sdk: Drex (system_one) and NDI (upload/parse/extract).

Keys come from the environment (NACE_API_KEY) via the SDK. Every call is
counted in USAGE, which is appended to backend/data/usage.json on change.
"""

from __future__ import annotations

import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from backend.app import config

USAGE: dict[str, int] = {
    "drex_calls": 0,
    "drex_questions": 0,
    "drex_input_tokens": 0,
    "ndi_jobs": 0,
    "ndi_pages": 0,
}

_client: Any = None


def get_client() -> Any:
    """Return the one shared AsyncNaceClient (created lazily)."""
    global _client
    if _client is None:
        from nace_sdk import AsyncNaceClient

        kwargs: dict[str, Any] = {"timeout": 120.0}
        base = os.environ.get("NACE_BASE_URL")
        if base:
            kwargs["base_url"] = base
        _client = AsyncNaceClient(**kwargs)
    return _client


def bump(usage_file: Path | None = None, **deltas: int) -> None:
    """Add deltas to USAGE and append a snapshot line to usage.json."""
    changed = False
    for key, delta in deltas.items():
        if delta:
            USAGE[key] = USAGE.get(key, 0) + int(delta)
            changed = True
    if not changed:
        return
    target = usage_file or config.USAGE_FILE
    target.parent.mkdir(parents=True, exist_ok=True)
    line = {"ts": datetime.now(timezone.utc).isoformat(), **USAGE}
    with target.open("a") as fh:
        fh.write(json.dumps(line) + "\n")


def _to_sdk_question(q: dict[str, Any]) -> Any:
    from nace_sdk import Choice, Noul

    if q.get("type") == "choice":
        return Choice(criteria=q["criteria"], instructions=q.get("instructions"))
    return Noul(instructions=q.get("instructions"), criteria=q.get("criteria"))


async def drex(
    state: dict[str, Any], questions: dict[str, dict[str, Any]], model: str | None = None
) -> dict[str, Any]:
    """One Drex call. Returns raw answers, usage, evaluation_time_ms, request_id, wall_ms."""
    client = get_client()
    sdk_questions = {qid: _to_sdk_question(q) for qid, q in questions.items()}
    t0 = time.perf_counter()
    try:
        resp = await client.system_one(
            state, sdk_questions, model=model or config.DREX_MODEL
        )
    finally:
        bump(drex_calls=1, drex_questions=len(questions))
    wall_ms = int((time.perf_counter() - t0) * 1000)
    usage = resp.usage.model_dump() if resp.usage is not None else {}
    bump(drex_input_tokens=int(usage.get("input_tokens") or 0))
    return {
        "model": resp.model,
        "answers": {k: v.model_dump() for k, v in resp.answers.items()},
        "usage": usage,
        "evaluation_time_ms": resp.evaluation_time_ms,
        "request_id": getattr(resp, "request_id", None),
        "wall_ms": wall_ms,
    }


async def _finish(job: Any) -> Any:
    if job.status != "succeeded":
        job = await get_client().jobs.wait(job.job_id)
    return job


def _pages(result: Any) -> int:
    if isinstance(result, dict):
        for key in ("page_count", "num_pages", "pages"):
            val = result.get(key)
            if isinstance(val, int):
                return val
            if isinstance(val, list):
                return len(val)
    return 1


async def ndi_extract(
    path: str | Path, schema: dict[str, Any], instructions: str | None = None
) -> dict[str, Any]:
    """Upload -> parse -> extract (parse_result source). Returns raw result + parse_ms."""
    client = get_client()
    p = Path(path)
    t0 = time.perf_counter()
    uploaded = await client.documents.upload(
        p, path=f"quorum/{p.name}", on_conflict="new_version"
    )
    parse_job = await client.documents.parse(uploaded.as_source(), wait_seconds=60)
    bump(ndi_jobs=1)
    parse_job = await _finish(parse_job)
    bump(ndi_pages=_pages(parse_job.result))
    extract_job = await client.documents.extract(
        {"type": "parse_result", "job_id": parse_job.job_id},
        schema=schema,
        instructions=instructions,
        citations={"enabled": True, "include_source_text": True},
        wait_seconds=60,
    )
    bump(ndi_jobs=1)
    extract_job = await _finish(extract_job)
    parse_ms = int((time.perf_counter() - t0) * 1000)
    return {
        "parse_job_id": parse_job.job_id,
        "extract_job_id": extract_job.job_id,
        "status": extract_job.status,
        "result": extract_job.result,
        "parse_ms": parse_ms,
    }
