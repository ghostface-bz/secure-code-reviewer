"""`/api/scans` routes (docs/API_CONTRACT.md)."""

from __future__ import annotations

import json
import re
import uuid
import zipfile
from io import BytesIO
from pathlib import Path
from typing import Annotated

import redis.asyncio as aioredis
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import JSONResponse, Response, StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session
from starlette.datastructures import UploadFile

from app import events
from app.config import settings
from app.db import get_db
from app.models import Finding, Scan, ScanStatus, Severity, SourceType, Tool
from app.queue import enqueue_scan
from app.sarif import build_sarif
from app.schemas import FindingOut, ScanCreateResponse, ScanDetail, ScanListItem, SeverityCounts

router = APIRouter(prefix="/scans", tags=["scans"])

# Reasonably strict but permissive validation for public git URLs.
_GIT_URL_RE = re.compile(
    r"^(https?://|git@|ssh://)[\w.\-:/@%]+(\.git)?/?$",
    re.IGNORECASE,
)


def _uploads_dir() -> Path:
    path = Path(settings.SCAN_DATA_DIR) / "uploads"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _counts_for(db: Session, scan_id: uuid.UUID) -> SeverityCounts:
    rows = db.execute(
        select(Finding.severity, Finding.id).where(Finding.scan_id == scan_id)
    ).all()
    counts = SeverityCounts()
    for severity, _id in rows:
        sev_value = severity.value if isinstance(severity, Severity) else str(severity)
        if hasattr(counts, sev_value):
            setattr(counts, sev_value, getattr(counts, sev_value) + 1)
        counts.total += 1
    return counts


def _to_list_item(db: Session, scan: Scan) -> ScanListItem:
    return ScanListItem(
        id=scan.id,
        source_type=scan.source_type,
        source_ref=scan.source_ref,
        status=scan.status,
        created_at=scan.created_at,
        finished_at=scan.finished_at,
        counts=_counts_for(db, scan.id),
    )


def _to_detail(db: Session, scan: Scan) -> ScanDetail:
    item = _to_list_item(db, scan)
    return ScanDetail(
        **item.model_dump(),
        started_at=scan.started_at,
        error=scan.error,
    )


@router.post("", status_code=status.HTTP_201_CREATED, response_model=ScanCreateResponse)
async def create_scan(
    request: Request,
    db: Annotated[Session, Depends(get_db)],
) -> ScanCreateResponse:
    """Create a scan from either a `.zip` upload or a git URL.

    - `multipart/form-data` with `file=<.zip>` -> zip path
    - `application/json` `{"source_type": "git", "source_ref": "https://..."}` -> git path
    """
    content_type = request.headers.get("content-type", "")

    if content_type.startswith("multipart/form-data"):
        return await _create_zip_scan(request, db)

    if content_type.startswith("application/json"):
        return await _create_git_scan(request, db)

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Unsupported Content-Type; expected multipart/form-data or application/json.",
    )


async def _create_zip_scan(request: Request, db: Session) -> ScanCreateResponse:
    form = await request.form()
    upload = form.get("file")
    if upload is None or not isinstance(upload, UploadFile):
        raise HTTPException(status_code=400, detail="Missing 'file' field for zip upload.")

    if upload.filename and not upload.filename.lower().endswith(".zip"):
        raise HTTPException(status_code=400, detail="Uploaded file must be a .zip archive.")

    data = await upload.read()
    if not data:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    if len(data) > settings.MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=400,
            detail=f"Uploaded file exceeds the {settings.MAX_UPLOAD_BYTES // (1024 * 1024)} MB cap.",
        )

    if not zipfile.is_zipfile(BytesIO(data)):
        raise HTTPException(status_code=400, detail="Uploaded file is not a valid zip archive.")

    scan = Scan(
        source_type=SourceType.zip,
        source_ref=upload.filename or "upload.zip",
        status=ScanStatus.queued,
    )
    db.add(scan)
    db.commit()
    db.refresh(scan)

    # Persist the raw zip on the shared scan-data volume for the worker to unpack.
    zip_path = _uploads_dir() / f"{scan.id}.zip"
    zip_path.write_bytes(data)

    enqueue_scan(str(scan.id))

    return ScanCreateResponse.model_validate(scan)


async def _create_git_scan(request: Request, db: Session) -> ScanCreateResponse:
    try:
        body = await request.json()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Invalid JSON body: {exc}") from exc

    if not isinstance(body, dict):
        raise HTTPException(status_code=400, detail="JSON body must be an object.")

    source_type = body.get("source_type")
    source_ref = body.get("source_ref")

    if source_type != "git":
        raise HTTPException(
            status_code=400, detail="source_type must be 'git' for JSON submissions."
        )
    if not isinstance(source_ref, str) or not _GIT_URL_RE.match(source_ref.strip()):
        raise HTTPException(status_code=400, detail="Invalid or missing git URL in 'source_ref'.")

    scan = Scan(
        source_type=SourceType.git,
        source_ref=source_ref.strip(),
        status=ScanStatus.queued,
    )
    db.add(scan)
    db.commit()
    db.refresh(scan)

    enqueue_scan(str(scan.id))

    return ScanCreateResponse.model_validate(scan)


@router.get("", response_model=list[ScanListItem])
def list_scans(db: Annotated[Session, Depends(get_db)]) -> list[ScanListItem]:
    """List all scans, newest first."""
    scans = db.execute(select(Scan).order_by(Scan.created_at.desc())).scalars().all()
    return [_to_list_item(db, scan) for scan in scans]


@router.get("/{scan_id}", response_model=ScanDetail)
def get_scan(scan_id: uuid.UUID, db: Annotated[Session, Depends(get_db)]) -> ScanDetail:
    scan = db.get(Scan, scan_id)
    if scan is None:
        raise HTTPException(status_code=404, detail="Scan not found.")
    return _to_detail(db, scan)


def _sse(event: str, data: str) -> str:
    return f"event: {event}\ndata: {data}\n\n"


@router.get("/{scan_id}/events")
async def scan_events(scan_id: uuid.UUID, db: Annotated[Session, Depends(get_db)]) -> StreamingResponse:
    """Server-Sent Events stream of live scan progress (replaces UI polling).

    Emits a `snapshot` event with current per-scanner state, then live `data`
    events ({type: scanner|scan, ...}) published by the worker, then `end`.
    """
    scan = db.get(Scan, scan_id)
    if scan is None:
        raise HTTPException(status_code=404, detail="Scan not found.")
    initial_status = scan.status.value
    sid = str(scan_id)

    async def event_stream():
        client = aioredis.from_url(settings.REDIS_URL)
        pubsub = client.pubsub()
        await pubsub.subscribe(events.channel(sid))
        try:
            snap = events.get_snapshot(sid)
            yield _sse("snapshot", json.dumps(snap))

            # Already terminal (incl. old scans with no snapshot) → nothing live to wait for.
            if (snap.get("status") or initial_status) in ("completed", "failed"):
                yield _sse("end", "{}")
                return

            while True:
                msg = await pubsub.get_message(ignore_subscribe_messages=True, timeout=15.0)
                if msg is None:
                    yield ": ping\n\n"  # heartbeat keeps the connection alive
                    continue
                data = msg["data"]
                if isinstance(data, bytes):
                    data = data.decode("utf-8", errors="replace")
                yield f"data: {data}\n\n"
                try:
                    ev = json.loads(data)
                except ValueError:
                    continue
                if ev.get("type") == "scan" and ev.get("state") in ("completed", "failed"):
                    yield _sse("end", "{}")
                    break
        finally:
            try:
                await pubsub.unsubscribe()
            except Exception:  # noqa: BLE001
                pass
            try:
                await client.aclose()
            except Exception:  # noqa: BLE001
                try:
                    await client.close()
                except Exception:  # noqa: BLE001
                    pass

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/{scan_id}/findings", response_model=list[FindingOut])
def get_findings(
    scan_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
    severity: Annotated[str | None, Query()] = None,
    tool: Annotated[str | None, Query()] = None,
    cwe: Annotated[str | None, Query()] = None,
    file: Annotated[str | None, Query()] = None,
    q: Annotated[str | None, Query()] = None,
) -> list[FindingOut]:
    scan = db.get(Scan, scan_id)
    if scan is None:
        raise HTTPException(status_code=404, detail="Scan not found.")

    stmt = select(Finding).where(Finding.scan_id == scan_id)

    if severity:
        try:
            stmt = stmt.where(Finding.severity == Severity(severity))
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid severity: {severity!r}")

    if tool:
        try:
            stmt = stmt.where(Finding.tool == Tool(tool))
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid tool: {tool!r}")

    if cwe:
        stmt = stmt.where(Finding.cwe == cwe)

    if file:
        stmt = stmt.where(Finding.file_path.ilike(f"%{file}%"))

    if q:
        like = f"%{q}%"
        stmt = stmt.where(Finding.title.ilike(like) | Finding.message.ilike(like))

    stmt = stmt.order_by(Finding.severity, Finding.file_path)

    findings = db.execute(stmt).scalars().all()
    return [FindingOut.model_validate(f) for f in findings]


@router.get("/{scan_id}/report.sarif")
def get_sarif_report(scan_id: uuid.UUID, db: Annotated[Session, Depends(get_db)]) -> Response:
    scan = db.get(Scan, scan_id)
    if scan is None:
        raise HTTPException(status_code=404, detail="Scan not found.")

    findings = (
        db.execute(select(Finding).where(Finding.scan_id == scan_id).order_by(Finding.file_path))
        .scalars()
        .all()
    )
    sarif = build_sarif(list(findings))
    return JSONResponse(content=sarif)


@router.get("/{scan_id}/report.pdf")
def get_pdf_report(scan_id: uuid.UUID, db: Annotated[Session, Depends(get_db)]) -> Response:
    scan = db.get(Scan, scan_id)
    if scan is None:
        raise HTTPException(status_code=404, detail="Scan not found.")

    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="PDF report export is not implemented yet (Phase 5 stretch).",
    )
