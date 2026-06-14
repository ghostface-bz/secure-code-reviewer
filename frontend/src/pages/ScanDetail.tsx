import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { ApiError, api } from "../api/client";
import StatusBadge from "../components/StatusBadge";
import SeverityBadge from "../components/SeverityBadge";
import ScannerProgress from "../components/ScannerProgress";
import { SeveritySummaryCards } from "../components/SeveritySummary";
import { SEVERITIES, TOOLS } from "../api/types";
import type {
  FindingsQuery,
  ScanEvent,
  ScannerRunState,
  ScanProgressSnapshot,
  Severity,
  Tool,
} from "../api/types";

export default function ScanDetail() {
  const { id } = useParams<{ id: string }>();
  const scanId = id ?? "";
  const queryClient = useQueryClient();

  const [severity, setSeverity] = useState<Severity | "">("");
  const [tool, setTool] = useState<Tool | "">("");
  const [q, setQ] = useState("");
  const [file, setFile] = useState("");

  // Live per-scanner progress, driven by the SSE stream (no polling).
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
  };

  const findingsQuery = useQuery({
    queryKey: ["findings", scanId, filters],
    queryFn: () => api.getFindings(scanId, filters),
    enabled: !!scanId,
  });

  const liveStatus = scanQuery.data?.status;
  const isActive = liveStatus === "queued" || liveStatus === "running";

  // Subscribe to the SSE progress stream while the scan is active; on the
  // terminal event, refetch the scan + findings once for the final result.
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
    es.onerror = () => es.close(); // degrade quietly; the scan still completes server-side

    return () => es.close();
  }, [scanId, isActive, queryClient]);

  if (scanQuery.isLoading) {
    return <div className="rounded-lg border border-gray-200 bg-white p-6 text-center text-gray-500">Loading scan...</div>;
  }

  if (scanQuery.error) {
    const err = scanQuery.error;
    return (
      <div className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
        {err instanceof ApiError
          ? err.status === 404
            ? "Scan not found."
            : `API unreachable: ${err.message}`
          : `Failed to load scan: ${String(err)}`}
      </div>
    );
  }

  const scan = scanQuery.data;
  if (!scan) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div>
        <Link to="/" className="text-sm text-gray-500 hover:underline">
          &larr; Back to scans
        </Link>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-xl font-semibold text-gray-900 break-all">
              {scan.source_type === "git" ? "git: " : "zip: "}
              {scan.source_ref}
            </h1>
            <p className="text-xs text-gray-400">{scan.id}</p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={scan.status} />
            <a
              href={api.sarifUrl(scan.id)}
              download
              className="rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-700"
            >
              Download SARIF
            </a>
          </div>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <dt className="text-xs uppercase text-gray-500">Created</dt>
          <dd className="text-gray-900">{new Date(scan.created_at).toLocaleString()}</dd>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <dt className="text-xs uppercase text-gray-500">Started</dt>
          <dd className="text-gray-900">{scan.started_at ? new Date(scan.started_at).toLocaleString() : "—"}</dd>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <dt className="text-xs uppercase text-gray-500">Finished</dt>
          <dd className="text-gray-900">{scan.finished_at ? new Date(scan.finished_at).toLocaleString() : "—"}</dd>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <dt className="text-xs uppercase text-gray-500">Source type</dt>
          <dd className="text-gray-900 capitalize">{scan.source_type}</dd>
        </div>
      </dl>

      {scan.status === "failed" && scan.error ? (
        <div className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          <strong>Error:</strong> {scan.error}
        </div>
      ) : null}

      {scan.status === "queued" || scan.status === "running" ? (
        <div className="space-y-3 rounded-md border border-blue-200 bg-blue-50 px-4 py-3">
          <p className="text-sm text-blue-700">
            Scan is {scan.status}… live updates, no refresh needed.
          </p>
          <ScannerProgress states={scannerStates} findings={scannerFindings} />
        </div>
      ) : null}

      <div>
        <h2 className="mb-2 text-lg font-semibold text-gray-900">Severity summary</h2>
        <SeveritySummaryCards counts={scan.counts} />
      </div>

      <div>
        <h2 className="mb-2 text-lg font-semibold text-gray-900">Findings</h2>

        <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div>
            <label htmlFor="filter-severity" className="mb-1 block text-xs font-medium text-gray-500">
              Severity
            </label>
            <select
              id="filter-severity"
              value={severity}
              onChange={(e) => setSeverity(e.target.value as Severity | "")}
              className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900 focus:border-gray-500 focus:outline-none"
            >
              <option value="">All</option>
              {SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="filter-tool" className="mb-1 block text-xs font-medium text-gray-500">
              Tool
            </label>
            <select
              id="filter-tool"
              value={tool}
              onChange={(e) => setTool(e.target.value as Tool | "")}
              className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900 focus:border-gray-500 focus:outline-none"
            >
              <option value="">All</option>
              {TOOLS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="filter-file" className="mb-1 block text-xs font-medium text-gray-500">
              File contains
            </label>
            <input
              id="filter-file"
              type="text"
              value={file}
              onChange={(e) => setFile(e.target.value)}
              placeholder="e.g. app/db.py"
              className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-500 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="filter-q" className="mb-1 block text-xs font-medium text-gray-500">
              Search title / message
            </label>
            <input
              id="filter-q"
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="e.g. SQL injection"
              className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-500 focus:outline-none"
            />
          </div>
        </div>

        {findingsQuery.isLoading ? (
          <div className="rounded-lg border border-gray-200 bg-white p-6 text-center text-gray-500">
            Loading findings...
          </div>
        ) : findingsQuery.error ? (
          <div className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
            {findingsQuery.error instanceof ApiError
              ? `API unreachable: ${findingsQuery.error.message}`
              : `Failed to load findings: ${String(findingsQuery.error)}`}
          </div>
        ) : !findingsQuery.data || findingsQuery.data.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-white p-6 text-center text-gray-500">
            {scan.status === "completed" || scan.status === "failed"
              ? "No findings match the current filters."
              : "No findings yet."}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-3 py-2">Tool</th>
                  <th className="px-3 py-2">Severity</th>
                  <th className="px-3 py-2">Title</th>
                  <th className="px-3 py-2">File:Line</th>
                  <th className="px-3 py-2">CWE</th>
                  <th className="px-3 py-2">OWASP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {findingsQuery.data.map((finding) => (
                  <tr key={finding.id} className="align-top hover:bg-gray-50">
                    <td className="px-3 py-2 whitespace-nowrap text-gray-700">{finding.tool}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <SeverityBadge severity={finding.severity} />
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-gray-900">{finding.title}</div>
                      <div className="text-xs text-gray-500">{finding.message}</div>
                      <div className="text-xs text-gray-400">{finding.rule_id}</div>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap font-mono text-xs text-gray-700">
                      {finding.file_path}
                      {finding.line_start ? `:${finding.line_start}` : ""}
                      {finding.line_end && finding.line_end !== finding.line_start ? `-${finding.line_end}` : ""}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-gray-700">{finding.cwe ?? "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-gray-700">{finding.owasp ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
