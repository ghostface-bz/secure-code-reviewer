import type { Severity } from "../api/types";

interface Meta {
  abbr: string;
  cls: string;
  dot: string;
}

const META: Record<Severity, Meta> = {
  critical: { abbr: "CRT", cls: "text-crit border-crit/40 bg-crit/10", dot: "bg-crit" },
  high: { abbr: "HGH", cls: "text-high border-high/40 bg-high/10", dot: "bg-high" },
  medium: { abbr: "MED", cls: "text-med border-med/40 bg-med/10", dot: "bg-med" },
  low: { abbr: "LOW", cls: "text-low border-low/40 bg-low/10", dot: "bg-low" },
  info: { abbr: "INF", cls: "text-info border-info/40 bg-info/10", dot: "bg-info" },
};

/** Severity marker — square dot + uppercase tag in the severity colour. */
export default function SeverityBadge({
  severity,
  compact = false,
}: {
  severity: Severity;
  compact?: boolean;
}) {
  const m = META[severity];
  return (
    <span
      className={`inline-flex items-center gap-1.5 border px-1.5 py-[3px] text-[0.62rem] font-semibold uppercase tracking-[0.12em] ${m.cls}`}
    >
      <span className={`h-1.5 w-1.5 ${m.dot}`} />
      {compact ? m.abbr : severity}
    </span>
  );
}
