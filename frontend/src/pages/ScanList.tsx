import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { ApiError, api } from "../api/client";
import StatusBadge from "../components/StatusBadge";
import { SeveritySummaryInline } from "../components/SeveritySummary";
import type { ScanListItem } from "../api/types";

const POLL_INTERVAL_MS = 2000;

function hasActiveScan(scans: ScanListItem[] | undefined): boolean {
  return !!scans?.some((s) => s.status === "queued" || s.status === "running");
}

export default function ScanList() {
  const navigate = useNavigate();
  const { data, error, isLoading } = useQuery({
    queryKey: ["scans"],
    queryFn: () => api.listScans(),
    refetchInterval: (query) => (hasActiveScan(query.state.data) ? POLL_INTERVAL_MS : false),
  });

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <div className="label">registry</div>
          <h1 className="text-xl font-semibold tracking-tight text-ink">Scans</h1>
        </div>
        <Link
          to="/new"
          className="border border-amber/50 px-3 py-2 text-xs uppercase tracking-[0.14em] text-amber transition-colors hover:bg-amber hover:text-base"
        >
          + New Scan
        </Link>
      </div>

      {isLoading ? (
        <div className="panel px-4 py-10 text-center text-sm text-dim">
          loading registry<span className="blink">_</span>
        </div>
      ) : error ? (
        <div className="border border-crit/40 bg-crit/10 px-4 py-3 text-sm text-crit">
          {error instanceof ApiError ? `API unreachable — ${error.message}` : `Failed to load: ${String(error)}`}
        </div>
      ) : !data || data.length === 0 ? (
        <div className="panel px-4 py-10 text-center text-sm text-dim">
          No scans yet.{" "}
          <Link to="/new" className="text-amber hover:underline">
            Start one →
          </Link>
        </div>
      ) : (
        <div className="panel panel-lit overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-line text-faint">
                <th className="px-4 py-2.5 text-[0.62rem] font-semibold uppercase tracking-[0.16em]">Source</th>
                <th className="px-4 py-2.5 text-[0.62rem] font-semibold uppercase tracking-[0.16em]">Status</th>
                <th className="px-4 py-2.5 text-[0.62rem] font-semibold uppercase tracking-[0.16em]">Severity</th>
                <th className="px-4 py-2.5 text-[0.62rem] font-semibold uppercase tracking-[0.16em]">Created</th>
              </tr>
            </thead>
            <tbody>
              {data.map((scan, i) => (
                <tr
                  key={scan.id}
                  onClick={() => navigate(`/scans/${scan.id}`)}
                  className="row-in cursor-pointer border-b border-line/60 transition-colors last:border-0 hover:bg-raised/60"
                  style={{ animationDelay: `${Math.min(i, 12) * 28}ms` }}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-[0.6rem] uppercase tracking-wider text-amber">
                        {scan.source_type}
                      </span>
                      <span className="truncate font-medium text-ink">{scan.source_ref}</span>
                    </div>
                    <div className="mt-0.5 text-[0.66rem] text-faint">{scan.id}</div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={scan.status} />
                  </td>
                  <td className="px-4 py-3">
                    <SeveritySummaryInline counts={scan.counts} />
                  </td>
                  <td className="px-4 py-3 text-xs text-dim">
                    {new Date(scan.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
