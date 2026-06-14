# API Contract (MVP) — FROZEN

Base URL: `http://localhost:8000/api`. JSON unless noted. **No auth in MVP** (auth is a
later slice); design handlers so a dependency can be added later without route changes.
CORS: allow `http://localhost:5173`.

The **frontend builds against this contract**; the **backend implements it exactly**.
Field names and shapes here are law. Snake_case in JSON.

---

### `POST /api/scans` — create a scan
Two ways to submit:
- **zip:** `multipart/form-data` with `file=<.zip>`
- **git:** `application/json` `{ "source_type": "git", "source_ref": "https://github.com/owner/repo" }`

→ `201` `{ "id": "<uuid>", "source_type": "zip|git", "source_ref": "...", "status": "queued", "created_at": "<iso8601>" }`
Errors: `400` bad/oversized upload (cap 50 MB) or invalid git URL.

### `GET /api/scans` — list scans (newest first)
→ `200` array of:
```json
{
  "id": "<uuid>", "source_type": "git", "source_ref": "...",
  "status": "completed", "created_at": "...", "finished_at": "...",
  "counts": { "critical": 1, "high": 3, "medium": 5, "low": 2, "info": 0, "total": 11 }
}
```

### `GET /api/scans/{id}` — scan detail
Same shape as a list item, plus `"started_at"`, `"error"`. `404` if missing.
(Frontend polls this while `status` is `queued`/`running`.)

### `GET /api/scans/{id}/findings` — findings for a scan
Query filters (all optional, combinable): `severity`, `tool`, `cwe`, `file` (substring),
`q` (text in title/message), `triage_status` (open|false_positive|resolved|suppressed),
`new_only` (bool — only findings whose fingerprint was not in the prior completed scan of
the same `source_ref` that finished before this one).
→ `200` array of:
```json
{
  "id": "<uuid>", "tool": "semgrep", "rule_id": "python.lang.security.audit...",
  "severity": "high", "title": "...", "message": "...",
  "file_path": "app/db.py", "line_start": 42, "line_end": 42,
  "cwe": "CWE-89", "owasp": "A03:2021-Injection",
  "triage_status": "open", "triage_note": null, "triaged_at": null
}
```
(`raw` is NOT returned in the list; available via the report export.)

### `PATCH /api/scans/{id}/findings/{finding_id}` — set triage state
Body: `{ "triage_status": "false_positive", "triage_note": "optional reason" }`
→ `200` the updated finding (same shape as above). `404` if the finding isn't in this scan.
Triage state is inherited by fingerprint when the same `source_ref` is re-scanned.

### `GET /api/scans/{id}/events` — live progress (Server-Sent Events)
`text/event-stream`. Emits an `event: snapshot` (current per-scanner state), then default
`message` events `{type:"scanner",scanner,state,findings?}` / `{type:"scan",state,counts?}`
as the scan runs, a 15 s heartbeat comment, and `event: end` when terminal. Already-terminal
scans get `snapshot` + `end` immediately. (The UI uses this instead of polling.)

### `GET /api/scans/{id}/report.sarif` — SARIF 2.1.0 export (REQUIRED)
→ `200` `application/json`, valid SARIF with one `run` per tool.
Findings triaged `suppressed` or `false_positive` are excluded from the export.

### `GET /api/scans/{id}/report.pdf` — PDF report (STRETCH, Phase 5)
→ `200` `application/pdf`. May 501 until implemented.

### `GET /api/health` — liveness
→ `200` `{ "status": "ok" }`

---

## Scanner sandbox contract (backend/worker)
Each scanner runs as an **ephemeral sibling container** via the Docker SDK:
- `network_disabled=True` (`--network none`)
- code mounted **read-only**: mount named volume `scr_scan_data` at `/src:ro`, scan `/src/<scan_id>`
- `mem_limit="2g"`, `nano_cpus` ~1.5 CPU, `user="1000:1000"` (non-root), `read_only=True` rootfs where possible, auto-remove
- capture stdout (JSON), parse → `normalize.py` → `findings`

Scanner images + commands:
| tool | image | command (scans `/src/<id>`) | network at scan time |
|------|-------|------------------------------|----------------------|
| gitleaks | `zricethezav/gitleaks:latest` | `detect --source /src/<id> --report-format json --report-path /dev/stdout --no-git` | none (built-in rules) |
| semgrep | `semgrep/semgrep:latest` | `semgrep scan --json --quiet --config /rules /src/<id>` | none — uses pre-fetched `/rules` |
| trivy | `aquasec/trivy:latest` | `fs --format json --scanners vuln --skip-db-update --cache-dir /trivy-cache /src/<id>` | none — uses pre-fetched cache |

**Offline rule/DB prefetch** (one-time, network allowed) — provide a `make prefetch` /
`backend/scripts/prefetch.sh` that populates the `semgrep_rules` and `trivy_cache` volumes:
- semgrep: clone a curated ruleset (e.g. `semgrep/semgrep-rules` `p/default` or the
  `python`,`javascript`,`secrets` packs) into the volume.
- trivy: `trivy fs --download-db-only --cache-dir /trivy-cache`.

**Build order of scanners:** gitleaks first (zero network/DB — proves the whole pipeline),
then semgrep, then trivy. The runner must be a uniform interface so each plugs in the same way.
