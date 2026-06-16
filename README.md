<p align="center">
  <img src="assets/caret-icon.svg" width="76" height="76" alt="caret logo" />
</p>

<h1 align="center">caret</h1>

<p align="center">
  Self-hostable static code analysis — multi-scanner SAST, secret &amp; dependency
  scanning with normalized, CWE/OWASP-mapped findings.
</p>

---

Upload a `.zip` or point it at a public Git repo; caret runs multiple open-source
scanners **inside isolated, network-less Docker sandboxes**, normalizes their wildly
different output into one schema, and lets you browse, filter, and export the results
(SARIF + report).

> Bachelor project. **Functionality first** — the analysis pipeline and sandbox isolation
> are the point; visual polish comes after it works.

## Stack
- **Backend:** Python 3.12 / FastAPI + SQLAlchemy + Alembic
- **Worker:** RQ (Redis-backed) — runs scans out of the request path
- **Sandbox:** scanners run as **ephemeral sibling Docker containers** (`--network none`,
  read-only code mount, non-root, CPU/mem caps) via the Docker SDK
- **Scanners (all free/OSS, run in their official images):**
  `gitleaks` (secrets) → `semgrep` (SAST) → `trivy` (SCA/deps)
- **DB:** PostgreSQL (relational findings + JSONB raw blob)
- **Frontend:** React + Vite + TypeScript + Tailwind
- **Export:** SARIF (required) · PDF report (stretch)

## Run it
```bash
docker compose up --build
# frontend  → http://localhost:5173
# backend   → http://localhost:8000  (docs at /docs)
```

## Repo layout
```
backend/         FastAPI app, models, worker, scanner runners, normalizer
frontend/        React + Vite dashboard
docs/            API_CONTRACT.md · DATA_MODEL.md · BUILD_PLAN.md  (the source of truth)
test-fixtures/   deliberately vulnerable sample code to scan
docker-compose.yml
```

See [`docs/BUILD_PLAN.md`](docs/BUILD_PLAN.md) for the phased plan and
[`docs/API_CONTRACT.md`](docs/API_CONTRACT.md) for the frozen API.
