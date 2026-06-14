import type { ScanStatus } from "../api/types";

interface Meta {
  cls: string;
  text: string;
  live?: boolean;
}

const META: Record<ScanStatus, Meta> = {
  queued: { cls: "border-line text-faint", text: "text-faint" },
  running: { cls: "border-amber/40 text-amber", text: "text-amber", live: true },
  completed: { cls: "border-ok/40 text-ok", text: "text-ok" },
  failed: { cls: "border-crit/40 text-crit", text: "text-crit" },
};

/** Scan status — bracketed console pill with a (pulsing) state dot. */
export default function StatusBadge({ status }: { status: ScanStatus }) {
  const m = META[status];
  return (
    <span
      className={`inline-flex items-center gap-2 border px-2.5 py-1 text-[0.62rem] font-semibold uppercase tracking-[0.18em] ${m.cls}`}
    >
      <span className={`dot ${m.live ? "dot-live" : ""} ${m.text}`} />
      {status}
    </span>
  );
}
