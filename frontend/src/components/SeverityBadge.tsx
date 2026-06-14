import { SEV_HEX } from "../lib/ui";
import type { Severity } from "../api/types";

/** Severity marker. `dot` = inline dot+label (tables); `pill` = bordered chip. */
export default function SeverityBadge({
  severity,
  variant = "dot",
}: {
  severity: Severity;
  variant?: "dot" | "pill";
}) {
  const hex = SEV_HEX[severity];
  if (variant === "pill") {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[12px] font-bold uppercase tracking-wide"
        style={{ color: hex, background: `${hex}1a`, borderColor: `${hex}4d` }}
      >
        <span className="h-[7px] w-[7px] rounded-full" style={{ background: hex }} />
        {severity}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2">
      <span className="h-2 w-2 rounded-full" style={{ background: hex }} />
      <span className="text-[12.5px] font-semibold capitalize" style={{ color: hex }}>
        {severity}
      </span>
    </span>
  );
}
