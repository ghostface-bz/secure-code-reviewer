"""RQ worker entrypoint + the `run_scan` job.

Run with `python -m app.worker` (see docker-compose.yml `worker` service).

`run_scan(scan_id)`:
1. mark the scan `running` (set `started_at`)
2. materialize the source into `$SCAN_DATA_DIR/<scan_id>/`:
   - zip: unzip the uploaded archive (written by the API to `uploads/<scan_id>.zip`)
   - git: `git clone --depth 1 <source_ref> <scan_id>/`
3. run gitleaks, semgrep, trivy as sibling containers and normalize their output
4. persist `Finding` rows
5. mark the scan `completed` (or `failed` + `error`)
"""

from __future__ import annotations

import hashlib
import logging
import shutil
import subprocess
import uuid
import zipfile
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

from rq import Worker
from sqlalchemy import select

from app import events
from app.config import settings
from app.db import SessionLocal
from app.models import Finding, Scan, ScanStatus, Severity, SourceType
from app.queue import redis_conn, scan_queue
from app.scanners import gitleaks, semgrep, trivy
from app.scanners.base import ScannerError
from app.schemas import RawFinding

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Each entry: (tool module, human name) — run in this order so gitleaks
# (zero network/DB) proves the pipeline first.
SCANNERS = [
    (gitleaks, "gitleaks"),
    (semgrep, "semgrep"),
    (trivy, "trivy"),
]


def _scan_data_dir(scan_id: str) -> Path:
    return Path(settings.SCAN_DATA_DIR) / scan_id


def _materialize_zip(scan_id: str, dest: Path) -> None:
    zip_path = Path(settings.SCAN_DATA_DIR) / "uploads" / f"{scan_id}.zip"
    if not zip_path.exists():
        raise RuntimeError(f"uploaded archive not found: {zip_path}")

    dest.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_path) as zf:
        _safe_extract(zf, dest)

    _flatten_single_root(dest)


def _safe_extract(zf: zipfile.ZipFile, dest: Path) -> None:
    """Extract a zip, guarding against path traversal (`..`, absolute paths)."""
    dest_resolved = dest.resolve()
    for member in zf.infolist():
        member_path = (dest / member.filename).resolve()
        if not str(member_path).startswith(str(dest_resolved)):
            raise RuntimeError(f"unsafe path in zip archive: {member.filename!r}")
    zf.extractall(dest)


def _flatten_single_root(dest: Path) -> None:
    """If the zip contained a single top-level directory, hoist its contents up.

    Many zip exports (e.g. GitHub "Download ZIP") wrap everything in a single
    `<repo>-<branch>/` directory. Flattening keeps reported file paths
    relative to the project root rather than `<repo>-<branch>/...`.
    """
    entries = list(dest.iterdir())
    if len(entries) == 1 and entries[0].is_dir():
        sole_dir = entries[0]
        for child in sole_dir.iterdir():
            shutil.move(str(child), str(dest / child.name))
        sole_dir.rmdir()


def _materialize_git(source_ref: str, dest: Path) -> None:
    dest.mkdir(parents=True, exist_ok=True)
    try:
        subprocess.run(
            ["git", "clone", "--depth", "1", source_ref, str(dest)],
            check=True,
            capture_output=True,
            text=True,
            timeout=600,
        )
    except subprocess.CalledProcessError as exc:
        raise RuntimeError(f"git clone failed: {exc.stderr.strip()[:1000]}") from exc
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError("git clone timed out after 600s") from exc

    # Scanners don't need the .git history; drop it to save space / avoid
    # gitleaks scanning git history (we pass --no-git anyway, but be tidy).
    git_dir = dest / ".git"
    if git_dir.exists():
        shutil.rmtree(git_dir, ignore_errors=True)


def _compute_content_hash(root: Path) -> str:
    """SHA-256 over the file tree (sorted relative path + bytes) for cache lookups."""
    h = hashlib.sha256()
    files = sorted(
        p for p in root.rglob("*") if p.is_file() and not p.is_symlink()
    )
    for p in files:
        h.update(p.relative_to(root).as_posix().encode("utf-8"))
        h.update(b"\0")
        try:
            h.update(p.read_bytes())
        except OSError:
            pass  # unreadable file — path alone still contributes to the hash
        h.update(b"\0")
    return h.hexdigest()


def _severity_counts(findings) -> dict[str, int]:
    """Cumulative severity breakdown (matches the API's SeverityCounts shape)."""
    counts = {s.value: 0 for s in Severity}
    counts["total"] = 0
    for f in findings:
        sev = f.severity.value if isinstance(f.severity, Severity) else str(f.severity)
        if sev in counts:
            counts[sev] += 1
        counts["total"] += 1
    return counts


def _run_one_scanner(module, name: str, scan_id: str) -> tuple[list[RawFinding], str | None]:
    """Run a single scanner; return (findings, error_or_None). Never raises."""
    events.scanner_state(scan_id, name, "running")
    try:
        logger.info("scan %s: running %s", scan_id, name)
        findings = module.run(scan_id, scan_id)
        logger.info("scan %s: %s produced %d findings", scan_id, name, len(findings))
        events.scanner_state(scan_id, name, "done", findings=len(findings))
        return findings, None
    except ScannerError as exc:
        logger.exception("scan %s: %s failed", scan_id, name)
        events.scanner_state(scan_id, name, "error")
        return [], str(exc)
    except Exception as exc:  # noqa: BLE001 - isolate scanner failures
        logger.exception("scan %s: %s failed unexpectedly", scan_id, name)
        events.scanner_state(scan_id, name, "error")
        return [], f"{name} scanner failed: {exc}"


def _run_all_scanners(scan_id: str) -> tuple[list[RawFinding], list[str]]:
    """Run the scanners against `<SCAN_DATA_DIR>/<scan_id>` with bounded parallelism.

    At most `SCANNER_CONCURRENCY` containers run at once (each capped at
    `SCANNER_MEM_LIMIT`), so peak memory stays bounded. Each scanner just blocks
    on `container.wait()` (I/O), so threads give real overlap despite the GIL.
    """
    all_findings: list[RawFinding] = []
    errors: list[str] = []

    max_workers = max(1, settings.SCANNER_CONCURRENCY)
    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        futures = [
            pool.submit(_run_one_scanner, module, name, scan_id)
            for module, name in SCANNERS
        ]
        for fut in futures:
            findings, error = fut.result()
            all_findings.extend(findings)
            if error:
                errors.append(error)

    return all_findings, errors


def _add_finding_from(db, scan_id: uuid.UUID, rf) -> None:
    """Persist a Finding row from a RawFinding (worker) or a prior Finding (cache clone)."""
    db.add(
        Finding(
            scan_id=scan_id,
            tool=rf.tool,
            rule_id=rf.rule_id,
            severity=rf.severity,
            title=rf.title,
            message=rf.message,
            file_path=rf.file_path,
            line_start=rf.line_start,
            line_end=rf.line_end,
            cwe=rf.cwe,
            owasp=rf.owasp,
            raw=rf.raw,
        )
    )


def run_scan(scan_id: str) -> None:
    """RQ job: run the full scan pipeline for `scan_id`."""
    db = SessionLocal()
    try:
        scan = db.get(Scan, uuid.UUID(scan_id))
        if scan is None:
            logger.error("scan %s not found", scan_id)
            return

        scan.status = ScanStatus.running
        scan.started_at = datetime.now(timezone.utc)
        db.commit()
        events.scan_started(scan_id, [name for _module, name in SCANNERS])

        dest = _scan_data_dir(scan_id)
        try:
            if scan.source_type == SourceType.zip:
                _materialize_zip(scan_id, dest)
            elif scan.source_type == SourceType.git:
                _materialize_git(scan.source_ref, dest)
            else:
                raise RuntimeError(f"unknown source_type: {scan.source_type}")
        except Exception as exc:  # noqa: BLE001
            logger.exception("scan %s: failed to materialize source", scan_id)
            scan.status = ScanStatus.failed
            scan.error = f"failed to prepare source: {exc}"
            scan.finished_at = datetime.now(timezone.utc)
            db.commit()
            events.scan_finished(scan_id, "failed", _severity_counts([]))
            return

        # Content-hash cache: if identical code was already scanned, clone those
        # findings instead of re-running the scanners (instant re-scans).
        content_hash = _compute_content_hash(dest)
        scan.content_hash = content_hash
        db.commit()

        cached = db.execute(
            select(Scan)
            .where(
                Scan.content_hash == content_hash,
                Scan.status == ScanStatus.completed,
                Scan.id != scan.id,
            )
            .order_by(Scan.finished_at.desc())
        ).scalars().first()

        if cached is not None:
            prior = db.execute(
                select(Finding).where(Finding.scan_id == cached.id)
            ).scalars().all()
            for pf in prior:
                _add_finding_from(db, scan.id, pf)
            scan.status = ScanStatus.completed
            scan.finished_at = datetime.now(timezone.utc)
            db.commit()
            logger.info(
                "scan %s: cache hit on %s (%d findings cloned)",
                scan_id, cached.id, len(prior),
            )
            events.scan_finished(scan_id, "completed", _severity_counts(prior))
            return

        findings, errors = _run_all_scanners(scan_id)

        for rf in findings:
            _add_finding_from(db, scan.id, rf)

        if errors and not findings:
            # All scanners failed and produced nothing useful — mark failed.
            scan.status = ScanStatus.failed
            scan.error = "; ".join(errors)[:4000]
        else:
            scan.status = ScanStatus.completed
            if errors:
                # Partial success: keep findings, but record what failed.
                scan.error = "; ".join(errors)[:4000]

        scan.finished_at = datetime.now(timezone.utc)
        db.commit()
        events.scan_finished(scan_id, scan.status.value, _severity_counts(findings))
        logger.info(
            "scan %s: completed with status=%s, %d findings, %d scanner errors",
            scan_id,
            scan.status,
            len(findings),
            len(errors),
        )
    finally:
        db.close()


def main() -> None:
    """Entrypoint for `python -m app.worker` — start an RQ worker on the scans queue."""
    worker = Worker([scan_queue], connection=redis_conn)
    worker.work(with_scheduler=False)


if __name__ == "__main__":
    main()
