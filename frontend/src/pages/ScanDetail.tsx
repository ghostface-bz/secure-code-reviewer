import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { ApiError, api } from "../api/client";
import StatusBadge from "../components/StatusBadge";
import SeverityBadge from "../components/SeverityBadge";
import ScannerProgress from "../components/ScannerProgress";
import { SeveritySummaryCards } from "../components/SeveritySummary";
import { SEVERITIES, TOOLS, TRIAGE_LABELS, TRIAGE_STATUSES } from "../api/types";
import type {
  FindingsQuery,
  ScanEvent,
  ScannerRunState,
  ScanProgressSnapshot,
  Severity,
  Tool,
  TriageStatus,
} from "../api/types";

function MetaCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-panel px-3 py-2.5">
      <div className="label">{label}</div>
      <div className="mt-0.5 truncate text-xs text-ink">{value}</div>
    </div>
  );
}

export default function ScanDetail() {
  const { id } = useParams<{ id: string }>();
  const scanId = id ?? "";
  const queryClient = useQueryClient();

  const [severity, setSeverity] = useState<Severity | "">("");
  const [tool, setTool] = useState<Tool | "">("");
  const [q, setQ] = useState("");
  const [file, setFile] = useState("");
  const [triageStatus, setTriageStatus] = useState<TriageStatus | "">("");
  const [newOnly, setNewOnly] = useState(false);

  const [scannerStates, setScannerStates] = useState<Partial<Record<Tool, ScannerRunState>>>({});
  const [scannerFindings, setScannerFindings] = useState<Partial<Record<Tool, number>>>({});

  const scanQuery = useQuery({
    queryKey: ["scan", scanId],
    queryFn: () => api.getScan(scanId),
    enabled: !!scanId,
  });

  const filters: FindingsQuery = {
    severity: severity || undefined,
    tool: tool || undefined,
    q: q.trim() || undefined,
    file: file.trim() || undefined,
    triage_status: triageStatus || undefined,
    new_only: newOnly || undefined,
  };

  const findingsQuery = useQuery({
    queryKey: ["findings", scanId, filters],
    queryFn: () => api.getFindings(scanId, filters),
    enabled: !!scanId,
  });

  const triageMutation = useMutation({
    mutationFn: ({ findingId, status }: { findingId: string; status: TriageStatus }) =>
      api.updateTriage(scanId, findingId, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["findings", scanId] }),
  });

  const liveStatus = scanQuery.data?.status;
  const isActive = liveStatus === "queued" || liveStatus === "running";

  useEffect(() => {
    if (!scanId || !isActive) return;
    const es = new EventSource(api.scanEventsUrl(scanId));

    const finish = () => {
      es.close();
      queryClient.invalidateQueries({ queryKey: ["scan", scanId] });
      queryClient.invalidateQueries({ queryKey: ["findings", scanId] });
    };

    es.addEventListener("snapshot", (e) => {
      try {
        const snap = JSON.parse((e as MessageEvent).data) as ScanProgressSnapshot;
        const states: Partial<Record<Tool, ScannerRunState>> = {};
        const found: Partial<Record<Tool, number>> = {};
        for (const t of TOOLS) {
          const s = snap[`scanner:${t}`];
          if (s) states[t] = s as ScannerRunState;
          const f = snap[`findings:${t}`];
          if (f !== undefined) found[t] = Number(f);
        }
        setScannerStates(states);
        setScannerFindings(found);
      } catch {
        /* ignore malformed snapshot */
      }
    });

    es.onmessage = (e) => {
      try {
        const ev = JSON.parse(e.data) as ScanEvent;
        if (ev.type === "scanner") {
          setScannerStates((prev) => ({ ...prev, [ev.scanner]: ev.state }));
          if (ev.findings !== undefined) {
            setScannerFindings((prev) => ({ ...prev, [ev.scanner]: ev.findings }));
          }
        }
      } catch {
        /* ignore */
      }
    };

    es.addEventListener("end", finish);
    es.onerror = () => es.close();
    return () => es.close();
  }, [scanId, isActive, queryClient]);

  if (scanQuery.isLoading) {
    return (
      <div className="panel px-4 py-10 text-center text-sm text-dim">
        loading scan<span className="blink">_</span>
      </div>
    );
  }

  if (scanQuery.error) {
    const err = scanQuery.error;
    return (
      <div className="border border-crit/40 bg-crit/10 px-4 py-3 text-sm text-crit">
        {err instanceof ApiError
          ? err.status === 404
            ? "Scan not found."
            : `API unreachable — ${err.message}`
          : `Failed to load scan: ${String(err)}`}
      </div>
    );
  }

  const scan = scanQuery.data;
  if (!scan) return null;

  const fmt = (s: string | null) => (s ? new Date(s).toLocaleString() : "—");

  return (
    <div className="space-y-6">
      <div>
        <Link to="/" className="text-xs uppercase tracking-[0.14em] text-faint hover:text-amber">
          ← registry
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[0.6rem] uppercase tracking-wider text-amber">{scan.source_type}</span>
              <h1 className="truncate text-lg font-semibold tracking-tight text-ink">{scan.source_ref}</h1>
            </div>
            <p className="mt-0.5 text-[0.66rem] text-faint">{scan.id}</p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={scan.status} />
            <a
              href={api.sarifUrl(scan.id)}
              download
              className="border border-line px-3 py-1.5 text-xs uppercase tracking-[0.12em] text-dim transition-colors hover:border-amber/50 hover:text-amber"
            >
              ↓ SARIF
            </a>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px border border-line bg-line sm:grid-cols-4">
        <MetaCell label="created" value={fmt(scan.created_at)} />
        <MetaCell label="started" value={fmt(scan.started_at)} />
        <MetaCell label="finished" value={fmt(scan.finished_at)} />
        <MetaCell label="source" value={scan.source_type} />
      </div>

      {scan.status === "failed" && scan.error ? (
        <div className="border border-crit/40 bg-crit/10 px-4 py-3 text-sm text-crit">
          <span className="label text-crit">error</span>
          <div className="mt-1">{scan.error}</div>
        </div>
      ) : null}

      {scan.status === "queued" || scan.status === "running" ? (
        <div className="panel panel-lit space-y-3 p-4">
          <div className="flex items-center gap-2">
            <span className="dot dot-live text-amber" />
            <span className="label text-amber">analysis in progress — live</span>
          </div>
          <ScannerProgress states={scannerStates} findings={scannerFindings} />
        </div>
      ) : null}

      <section className="space-y-2">
        <div className="label">severity breakdown</div>
        <SeveritySummaryCards counts={scan.counts} />
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="label">findings{findingsQuery.data ? ` · ${findingsQuery.data.length}` : ""}</div>
        </div>

        <div className="panel grid grid-cols-2 gap-3 p-3 sm:grid-cols-3 lg:grid-cols-6">
          <Selectish label="severity" value={severity} onChange={(v) => setSeverity(v as Severity | "")} options={SEVERITIES} />
          <Selectish label="tool" value={tool} onChange={(v) => setTool(v as Tool | "")} options={TOOLS} />
          <Selectish
            label="triage"
            value={triageStatus}
            onChange={(v) => setTriageStatus(v as TriageStatus | "")}
            options={TRIAGE_STATUSES}
            labels={TRIAGE_LABELS}
          />
          <Inputish label="file" value={file} onChange={setFile} placeholder="app/db.py" />
          <Inputish label="search" value={q} onChange={setQ} placeholder="sql injection" />
          <label className="flex cursor-pointer flex-col justify-end gap-1.5 pb-1">
            <span className="label">baseline</span>
            <span className="flex items-center gap-2 text-xs text-ink">
              <input
                type="checkbox"
                checked={newOnly}
                onChange={(e) => setNewOnly(e.target.checked)}
                className="h-3.5 w-3.5 accent-amber"
              />
              new only
            </span>
          </label>
        </div>

        {findingsQuery.isLoading ? (
          <div className="panel px-4 py-8 text-center text-sm text-dim">
            loading findings<span className="blink">_</span>
          </div>
        ) : findingsQuery.error ? (
          <div className="border border-crit/40 bg-crit/10 px-4 py-3 text-sm text-crit">
            {findingsQuery.error instanceof ApiError
              ? `API unreachable — ${findingsQuery.error.message}`
              : `Failed to load findings: ${String(findingsQuery.error)}`}
          </div>
        ) : !findingsQuery.data || findingsQuery.data.length === 0 ? (
          <div className="panel px-4 py-8 text-center text-sm text-dim">
            {scan.status === "completed" || scan.status === "failed"
              ? "No findings match the current filters."
              : "No findings yet — scanners are still running."}
          </div>
        ) : (
          <div className="panel panel-lit overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-b border-line text-faint">
                  {["sev", "tool", "finding", "file:line", "cwe", "owasp", "triage"].map((h) => (
                    <th key={h} className="px-3 py-2.5 text-[0.6rem] font-semibold uppercase tracking-[0.16em]">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {findingsQuery.data.map((finding, i) => (
                  <tr
                    key={finding.id}
                    className={`row-in border-b border-line/50 align-top transition-colors last:border-0 hover:bg-raised/50 ${
                      finding.triage_status !== "open" ? "opacity-45" : ""
                    }`}
                    style={{ animationDelay: `${Math.min(i, 16) * 22}ms` }}
                  >
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <SeverityBadge severity={finding.severity} compact />
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-xs text-dim">{finding.tool}</td>
                    <td className="max-w-md px-3 py-2.5">
                      <div className="font-medium text-ink">{finding.title}</div>
                      <div className="mt-0.5 text-pretty font-sans text-xs text-dim">
                        {finding.message}
                      </div>
                      <div className="mt-0.5 text-[0.62rem] text-faint">{finding.rule_id}</div>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-xs text-amber/90">
                      {finding.file_path}
                      {finding.line_start ? <span className="text-faint">:{finding.line_start}</span> : ""}
                      {finding.line_end && finding.line_end !== finding.line_start ? (
                        <span className="text-faint">-{finding.line_end}</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-xs text-dim">{finding.cwe ?? "—"}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-xs text-dim">{finding.owasp ?? "—"}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <select
                        aria-label="Triage status"
                        value={finding.triage_status}
                        disabled={triageMutation.isPending}
                        onChange={(e) =>
                          triageMutation.mutate({ findingId: finding.id, status: e.target.value as TriageStatus })
                        }
                        className="field py-1 text-[0.66rem]"
                      >
                        {TRIAGE_STATUSES.map((t) => (
                          <option key={t} value={t}>
                            {TRIAGE_LABELS[t]}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Selectish({
  label,
  value,
  onChange,
  options,
  labels,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
  labels?: Record<string, string>;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="label">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="field">
        <option value="">all</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {labels ? labels[o] : o}
          </option>
        ))}
      </select>
    </div>
  );
}

function Inputish({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="label">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="field"
      />
    </div>
  );
}
