import { STATUS_HEX } from "../lib/ui";
import type { ScanStatus } from "../api/types";

/** Scan status pill — coloured, with a pulsing dot while running. */
export default function StatusBadge({ status }: { status: ScanStatus }) {
  const hex = STATUS_HEX[status];
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[11.5px] font-semibold capitalize"
      style={{ color: hex, background: `${hex}1f` }}
    >
      <span
        className={`h-[7px] w-[7px] rounded-full ${status === "running" ? "pulse-dot" : ""}`}
        style={{ background: hex }}
      />
      {status}
    </span>
  );
}
