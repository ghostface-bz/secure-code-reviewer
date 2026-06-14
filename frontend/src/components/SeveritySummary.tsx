import type { Severity, SeverityCounts } from "../api/types";
import { SEVERITIES } from "../api/types";

const DOT: Record<Severity, string> = {
  critical: "bg-crit",
  high: "bg-high",
  medium: "bg-med",
  low: "bg-low",
  info: "bg-info",
};
const TEXT: Record<Severity, string> = {
  critical: "text-crit",
  high: "text-high",
  medium: "text-med",
  low: "text-low",
  info: "text-info",
};

/** Compact inline counts for scan-list rows — coloured square + tabular count. */
export function SeveritySummaryInline({ counts }: { counts: SeverityCounts }) {
  const any = counts.total > 0;
  return (
    <div className="flex flex-wrap items-center gap-2.5 text-xs">
      {SEVERITIES.map((sev) => (
        <span
          key={sev}
          className={`inline-flex items-center gap-1 ${counts[sev] ? "" : "opacity-30"}`}
        >
          <span className={`h-1.5 w-1.5 ${DOT[sev]}`} />
          <span className={`tnum ${counts[sev] ? TEXT[sev] : "text-faint"}`}>{counts[sev]}</span>
        </span>
      ))}
      {!any ? <span className="text-faint">—</span> : null}
    </div>
  );
}

/** Stat strip for the scan-detail header — one cell per severity + total. */
export function SeveritySummaryCards({ counts }: { counts: SeverityCounts }) {
  return (
    <div className="grid grid-cols-3 gap-px border border-line bg-line sm:grid-cols-6">
      {SEVERITIES.map((sev) => (
        <div key={sev} className="bg-panel px-3 py-3">
          <div className="flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 ${DOT[sev]}`} />
            <span className="label">{sev}</span>
          </div>
          <div className={`tnum mt-1 text-2xl font-semibold ${counts[sev] ? TEXT[sev] : "text-faint"}`}>
            {String(counts[sev]).padStart(2, "0")}
          </div>
        </div>
      ))}
      <div className="bg-raised px-3 py-3">
        <div className="label">total</div>
        <div className="tnum mt-1 text-2xl font-semibold text-ink">
          {String(counts.total).padStart(2, "0")}
        </div>
      </div>
    </div>
  );
}
