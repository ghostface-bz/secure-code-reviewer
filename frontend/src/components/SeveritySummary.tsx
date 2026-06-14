import type { SeverityCounts } from "../api/types";
import { SEVERITIES } from "../api/types";
import { SEV_HEX } from "../lib/ui";

/** Compact severity dots+counts for registry rows. */
export function SeveritySummaryInline({ counts }: { counts: SeverityCounts }) {
  if (counts.total === 0) return <span className="text-[13px] text-fainter">—</span>;
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      {SEVERITIES.map((sev) =>
        counts[sev] ? (
          <span key={sev} className="inline-flex items-center gap-1.5">
            <span className="h-[7px] w-[7px] rounded-full" style={{ background: SEV_HEX[sev] }} />
            <span className="mono tnum text-[12.5px]" style={{ color: SEV_HEX[sev] }}>
              {counts[sev]}
            </span>
          </span>
        ) : null,
      )}
    </div>
  );
}
