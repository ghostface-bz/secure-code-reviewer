"""Scan progress events over Redis pub/sub — backs the SSE endpoint.

The worker publishes scan- and scanner-level state changes to a per-scan
channel and keeps a short-lived snapshot hash so a client that connects
mid-scan can render current state before the next live event arrives.

Reuses the existing (sync) Redis connection from the RQ setup — no new infra.
"""

from __future__ import annotations

import json
from typing import Any

from app.queue import redis_conn

SNAPSHOT_TTL = 3600  # seconds — snapshot is a convenience for late subscribers


def channel(scan_id: str) -> str:
    return f"scan:{scan_id}:events"


def _snapshot_key(scan_id: str) -> str:
    return f"scan:{scan_id}:progress"


def _publish(scan_id: str, event: dict[str, Any]) -> None:
    redis_conn.publish(channel(scan_id), json.dumps(event))


def _touch_snapshot(scan_id: str, mapping: dict[str, str]) -> None:
    key = _snapshot_key(scan_id)
    redis_conn.hset(key, mapping=mapping)
    redis_conn.expire(key, SNAPSHOT_TTL)


def scan_started(scan_id: str, scanners: list[str]) -> None:
    mapping = {"status": "running"}
    for s in scanners:
        mapping[f"scanner:{s}"] = "pending"
    _touch_snapshot(scan_id, mapping)
    _publish(scan_id, {"type": "scan", "state": "running"})


def scanner_state(scan_id: str, scanner: str, state: str, findings: int | None = None) -> None:
    """state: running | done | error."""
    mapping = {f"scanner:{scanner}": state}
    if findings is not None:
        mapping[f"findings:{scanner}"] = str(findings)
    _touch_snapshot(scan_id, mapping)
    event: dict[str, Any] = {"type": "scanner", "scanner": scanner, "state": state}
    if findings is not None:
        event["findings"] = findings
    _publish(scan_id, event)


def scan_finished(scan_id: str, status: str, counts: dict[str, int]) -> None:
    """status: completed | failed."""
    _touch_snapshot(scan_id, {"status": status, "counts": json.dumps(counts)})
    _publish(scan_id, {"type": "scan", "state": status, "counts": counts})


def get_snapshot(scan_id: str) -> dict[str, str]:
    """Decoded snapshot hash (empty if none / expired)."""
    raw = redis_conn.hgetall(_snapshot_key(scan_id))
    out: dict[str, str] = {}
    for k, v in raw.items():
        out[k.decode() if isinstance(k, bytes) else k] = (
            v.decode() if isinstance(v, bytes) else v
        )
    return out
