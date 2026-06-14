import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { ApiError, api } from "../api/client";
import StatusBadge from "../components/StatusBadge";
import { SeveritySummaryInline } from "../components/SeveritySummary";
import { relativeTime } from "../lib/ui";
import type { ScanListItem } from "../api/types";

const POLL_INTERVAL_MS = 2000;

const hasActive = (s: ScanListItem[] | undefined) =>
  !!s?.some((x) => x.status === "queued" || x.status === "running");

export default function ScanList() {
  const navigate = useNavigate();
  const { data, error, isLoading } = useQuery({
    queryKey: ["scans"],
    queryFn: () => api.listScans(),
    refetchInterval: (q) => (hasActive(q.state.data) ? POLL_INTERVAL_MS : false),
  });

  return (
    <div className="mx-auto max-w-[1320px] px-8 pb-10 pt-7">
      <div className="mb-5 flex items-end justify-between">
        <div>
          <h1 className="m-0 text-[23px] font-semibold tracking-tight text-head">Scans</h1>
          <p className="m-0 mt-1 text-[13.5px] text-faint">
            {data ? `${data.length} target${data.length === 1 ? "" : "s"} analysed` : "—"} · gitleaks · semgrep · trivy
          </p>
        </div>
        <Link
          to="/new"
          className="rounded-lg border border-line2 px-3.5 py-2 text-[12.5px] text-dim transition-colors hover:border-fainter hover:text-ink"
        >
          + New scan
        </Link>
      </div>

      {isLoading ? (
        <div className="card px-5 py-12 text-center text-[13px] text-faint">
          loading registry<span className="blink">_</span>
        </div>
      ) : error ? (
        <div className="rounded-xl border border-crit/30 bg-crit/10 px-4 py-3 text-[13px] text-crit">
          {error instanceof ApiError ? `API unreachable — ${error.message}` : `Failed: ${String(error)}`}
        </div>
      ) : !data || data.length === 0 ? (
        <div className="card px-5 py-12 text-center text-[13px] text-faint">
          No scans yet.{" "}
          <Link to="/new" className="text-lime hover:underline">
            Start one →
          </Link>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="grid grid-cols-[1fr_140px_180px_130px] gap-3.5 border-b border-line bg-bar px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[.4px] text-fainter">
            <span>Target</span>
            <span>Status</span>
            <span>Severity</span>
            <span className="text-right">Scanned</span>
          </div>
          {data.map((scan, i) => (
            <div
              key={scan.id}
              onClick={() => navigate(`/scans/${scan.id}`)}
              className="row-in grid cursor-pointer grid-cols-[1fr_140px_180px_130px] items-center gap-3.5 border-b border-line-soft px-5 py-3.5 transition-colors last:border-0 hover:bg-[#13161b]"
              style={{ animationDelay: `${Math.min(i, 14) * 26}ms` }}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="mono text-[10px] uppercase tracking-wide text-lime">{scan.source_type}</span>
                  <span className="truncate text-[13.5px] font-medium text-ink">{scan.source_ref}</span>
                </div>
                <div className="mono mt-0.5 truncate text-[11px] text-codeln">{scan.id}</div>
              </div>
              <StatusBadge status={scan.status} />
              <SeveritySummaryInline counts={scan.counts} />
              <div className="text-right text-[12px] text-faint">{relativeTime(scan.finished_at ?? scan.created_at)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
